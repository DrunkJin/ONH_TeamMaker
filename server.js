const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ['websocket', 'polling']
});
const cors = require('cors');
const path = require('path');

app.use(cors({
  origin: "*",
  credentials: true
}));
app.use(express.json());

// 정적 파일 제공
app.use(express.static('client/build'));

// 게임 상태 저장
const games = new Map();

// 게임 룸 관리
class GameRoom {
    constructor(hostId, initialPoints = 1000, items = []) {
        this.hostId = hostId;        // 사회자 ID
        this.teamLeaders = {};       // 팀장 정보
        this.currentAuction = null;  // 현재 경매 정보
        this.players = new Set();    // 참가자 목록
        this.status = 'waiting';     // 게임 상태 (waiting, playing, finished)
        this.initialPoints = initialPoints; // 팀장 초기 포인트
        this.items = items;          // 경매 물품 목록
        this.remainingItems = [...items];  // 남은 물품 목록
        this.completedItems = [];    // 경매 완료된 물품 목록
    }

    // 랜덤하게 다음 경매 물품 선택
    getNextItem() {
        if (this.remainingItems.length === 0) {
            return null;
        }
        const randomIndex = Math.floor(Math.random() * this.remainingItems.length);
        const selectedItem = this.remainingItems[randomIndex];
        this.remainingItems.splice(randomIndex, 1);  // 선택된 물품 제거
        return selectedItem;
    }

    // 경매 완료 물품 추가
    addCompletedItem(item, winner, amount) {
        this.completedItems.push({
            item,
            winner,
            amount,
            timestamp: new Date()
        });
    }
}

// 유틸리티 함수
function generateRoomId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function getGameState(game) {
    return {
        teamLeaders: Object.fromEntries(
            Object.entries(game.teamLeaders).map(([id, data]) => [
                id,
                {
                    name: data.name,
                    points: data.points,
                    team: data.team
                }
            ])
        ),
        currentAuction: game.currentAuction ? {
            playerName: game.currentAuction.playerName,
            currentBid: game.currentAuction.currentBid,
            currentBidder: game.currentAuction.currentBidder
        } : null,
        remainingItemsCount: game.remainingItems.length,
        completedItems: game.completedItems,
        totalItems: game.items.length
    };
}

function finalizeAuction(game, roomId, autoFinalized) {
    if (!game.currentAuction || !game.currentAuction.currentBidder) return;

    clearInterval(game.currentAuction.timerInterval);
    
    const winner = game.teamLeaders[game.currentAuction.currentBidder];
    winner.points -= game.currentAuction.currentBid;
    winner.team.push(game.currentAuction.playerName);

    // 완료된 경매 기록 추가
    game.addCompletedItem(
        game.currentAuction.playerName,
        winner.name,
        game.currentAuction.currentBid
    );

    io.to(roomId).emit('auction_finalized', {
        player: game.currentAuction.playerName,
        winner: winner.name,
        amount: game.currentAuction.currentBid,
        autoFinalized
    });

    game.currentAuction = null;
    io.to(roomId).emit('game_state_update', getGameState(game));
}

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // 방 생성 (사회자)
    socket.on('create_room', ({ initialPoints = 1000, items = [] }) => {
        const roomId = generateRoomId();
        games.set(roomId, new GameRoom(socket.id, initialPoints, items));
        socket.join(roomId);
        socket.emit('room_created', { roomId });
    });

    // 방 참가 (팀장/관전자)
    socket.on('join_room', ({ roomId, role, name }) => {
        const game = games.get(roomId);
        if (!game) {
            socket.emit('error', { message: '존재하지 않는 방입니다.' });
            return;
        }

        socket.join(roomId);
        if (role === 'teamLeader') {
            game.teamLeaders[socket.id] = {
                name: name,
                points: game.initialPoints,
                team: []
            };
        }
        
        game.players.add(socket.id);
        io.to(roomId).emit('game_state_update', getGameState(game));
    });

    // 경매 시작 (사회자)
    socket.on('start_auction', ({ roomId }) => {
        const game = games.get(roomId);
        if (!game || game.hostId !== socket.id) return;

        const nextItem = game.getNextItem();
        if (!nextItem) {
            socket.emit('error', { message: '더 이상 경매할 물품이 없습니다.' });
            return;
        }

        if (game.currentAuction) {
            clearInterval(game.currentAuction.timerInterval);
        }

        game.currentAuction = {
            playerName: nextItem,
            currentBid: 0,
            currentBidder: null,
            status: 'active',
            timer: 20,  // 초기 20초
            timerInterval: null
        };

        game.currentAuction.timerInterval = setInterval(() => {
            game.currentAuction.timer--;
            
            io.to(roomId).emit('timer_update', { 
                timeLeft: game.currentAuction.timer 
            });

            if (game.currentAuction.timer <= 0) {
                clearInterval(game.currentAuction.timerInterval);
                if (game.currentAuction.currentBidder) {
                    finalizeAuction(game, roomId, true);
                } else {
                    io.to(roomId).emit('auction_cancelled', {
                        player: game.currentAuction.playerName,
                        reason: '입찰자가 없어 경매가 취소되었습니다.'
                    });
                    game.currentAuction = null;
                }
                io.to(roomId).emit('game_state_update', getGameState(game));
            }
        }, 1000);

        io.to(roomId).emit('auction_started', {
            playerName: nextItem,
            currentBid: 0
        });
        io.to(roomId).emit('game_state_update', getGameState(game));
    });

    // 입찰 (팀장)
    socket.on('place_bid', ({ roomId, amount }) => {
        const game = games.get(roomId);
        if (!game || !game.currentAuction || !game.teamLeaders[socket.id]) return;

        const teamLeader = game.teamLeaders[socket.id];
        
        // 입찰액이 10의 배수가 아닌 경우
        if (amount % 10 !== 0) {
            socket.emit('error', { message: '입찰 금액은 10의 배수여야 합니다.' });
            return;
        }

        // 입찰액이 현재 최고 입찰액 이하이거나 보유 포인트보다 많은 경우
        if (amount <= game.currentAuction.currentBid || amount > teamLeader.points) {
            socket.emit('error', { message: '유효하지 않은 입찰입니다.' });
            return;
        }

        game.currentAuction.currentBid = amount;
        game.currentAuction.currentBidder = socket.id;
        
        // 남은 시간이 5초 이하일 때만 5초로 연장
        if (game.currentAuction.timer <= 5) {
            game.currentAuction.timer = 5;
        }
        
        io.to(roomId).emit('bid_update', {
            amount,
            bidder: teamLeader.name
        });
        io.to(roomId).emit('game_state_update', getGameState(game));
    });

    // 낙찰 처리 (사회자)
    socket.on('finalize_auction', ({ roomId }) => {
        const game = games.get(roomId);
        if (!game || game.hostId !== socket.id) return;

        finalizeAuction(game, roomId, false);
    });

    // 연결 끊김 처리
    socket.on('disconnect', () => {
        games.forEach((game, roomId) => {
            if (game.players.has(socket.id)) {
                game.players.delete(socket.id);
                if (game.teamLeaders[socket.id]) {
                    delete game.teamLeaders[socket.id];
                }
                io.to(roomId).emit('game_state_update', getGameState(game));
            }
        });
        console.log('User disconnected:', socket.id);
    });
});

// React 앱으로 라우팅
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'client/build', 'index.html'));
});

const port = process.env.PORT || 3001;
http.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});