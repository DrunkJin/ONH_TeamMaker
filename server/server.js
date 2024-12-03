const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const cors = require('cors');

app.use(cors());
app.use(express.json());

// 게임 상태 저장
const games = new Map();

// 게임 룸 관리
class GameRoom {
    constructor(hostId) {
        this.hostId = hostId;        // 사회자 ID
        this.teamLeaders = {};       // 팀장 정보
        this.currentAuction = null;  // 현재 경매 정보
        this.players = new Set();    // 참가자 목록
        this.status = 'waiting';     // 게임 상태 (waiting, playing, finished)
    }
}

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // 방 생성 (사회자)
    socket.on('create_room', () => {
        const roomId = generateRoomId();
        games.set(roomId, new GameRoom(socket.id));
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
                points: 1000,  // 초기 포인트
                team: []
            };
        }
        
        game.players.add(socket.id);
        io.to(roomId).emit('game_state_update', getGameState(game));
    });

    // 경매 시작 (사회자)
    socket.on('start_auction', ({ roomId, playerName, startingBid }) => {
        const game = games.get(roomId);
        if (!game || game.hostId !== socket.id) return;

        game.currentAuction = {
            playerName,
            currentBid: startingBid,
            currentBidder: null,
            status: 'active',
            timer: 30,
            timerInterval: null
        };

        // 30초 타이머 시작
        game.currentAuction.timerInterval = setInterval(() => {
            game.currentAuction.timer--;
            
            // 남은 시간 브로드캐스트
            io.to(roomId).emit('timer_update', { 
                timeLeft: game.currentAuction.timer 
            });

            // 시간 종료시 자동 낙찰
            if (game.currentAuction.timer <= 0) {
                clearInterval(game.currentAuction.timerInterval);
                if (game.currentAuction.currentBidder) {
                    const winner = game.teamLeaders[game.currentAuction.currentBidder];
                    winner.points -= game.currentAuction.currentBid;
                    winner.team.push(game.currentAuction.playerName);

                    io.to(roomId).emit('auction_finalized', {
                        player: game.currentAuction.playerName,
                        winner: winner.name,
                        amount: game.currentAuction.currentBid,
                        autoFinalized: true
                    });
                } else {
                    io.to(roomId).emit('auction_cancelled', {
                        player: game.currentAuction.playerName,
                        reason: '입찰자가 없어 경매가 취소되었습니다.'
                    });
                }
                game.currentAuction = null;
                io.to(roomId).emit('game_state_update', getGameState(game));
            }
        }, 1000);

        io.to(roomId).emit('auction_started', game.currentAuction);
    });

    // 입찰 (팀장)
    socket.on('place_bid', ({ roomId, amount }) => {
        const game = games.get(roomId);
        if (!game || !game.currentAuction || !game.teamLeaders[socket.id]) return;

        const teamLeader = game.teamLeaders[socket.id];
        if (amount <= game.currentAuction.currentBid || amount > teamLeader.points) {
            socket.emit('error', { message: '유효하지 않은 입찰입니다.' });
            return;
        }

        game.currentAuction.currentBid = amount;
        game.currentAuction.currentBidder = socket.id;
        
        io.to(roomId).emit('bid_update', {
            amount,
            bidder: teamLeader.name
        });
    });

    // 낙찰 처리 (사회자)
    socket.on('finalize_auction', ({ roomId }) => {
        const game = games.get(roomId);
        if (!game || game.hostId !== socket.id) return;

        const auction = game.currentAuction;
        if (!auction || !auction.currentBidder) return;

        const winner = game.teamLeaders[auction.currentBidder];
        winner.points -= auction.currentBid;
        winner.team.push(auction.playerName);

        game.currentAuction = null;
        io.to(roomId).emit('auction_finalized', {
            player: auction.playerName,
            winner: winner.name,
            amount: auction.currentBid
        });
        io.to(roomId).emit('game_state_update', getGameState(game));
    });

    // 연결 끊김 처리
    socket.on('disconnect', () => {
        games.forEach((game, roomId) => {
            if (game.players.has(socket.id)) {
                game.players.delete(socket.id);
                delete game.teamLeaders[socket.id];
                io.to(roomId).emit('game_state_update', getGameState(game));
            }
        });
    });
});

// 유틸리티 함수들
function generateRoomId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function getGameState(game) {
    return {
        teamLeaders: Object.fromEntries(
            Object.entries(game.teamLeaders).map(([id, data]) => [
                data.name,
                {
                    points: data.points,
                    team: data.team
                }
            ])
        ),
        currentAuction: game.currentAuction,
        status: game.status
    };
}

const PORT = process.env.PORT || 3001;
http.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});