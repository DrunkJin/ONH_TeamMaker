const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const cors = require('cors');
const path = require('path');

// CORS 설정
app.use(cors());
app.use(express.json());

// 정적 파일 제공 (React 앱)
app.use(express.static(path.join(__dirname, 'client/build')));

// 게임 상태 저장
const games = new Map();

// 게임 룸 관리
class GameRoom {
    constructor(hostId) {
        this.hostId = hostId;
        this.teamLeaders = {};
        this.currentAuction = null;
        this.players = new Set();
        this.status = 'waiting';
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

    // ... (나머지 소켓 이벤트 핸들러들)
});

// 모든 라우트를 React 앱으로 리다이렉트
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'client/build', 'index.html'));
});

const port = process.env.PORT || 3000;
http.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});