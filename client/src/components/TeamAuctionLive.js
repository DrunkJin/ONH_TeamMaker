import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import { Alert, AlertTitle } from '@/components/ui/alert';

// 개발/배포 환경에 따른 서버 URL 설정
const SERVER_URL = process.env.REACT_APP_SERVER_URL || 'http://localhost:3001';
const socket = io(SERVER_URL);

const TeamAuctionLive = () => {
  const [role, setRole] = useState(null); // 'host', 'teamLeader', 'spectator'
  const [name, setName] = useState('');
  const [roomId, setRoomId] = useState('');
  const [gameState, setGameState] = useState(null);
  const [alert, setAlert] = useState(null);
  const [currentPlayer, setCurrentPlayer] = useState('');
  const [bidAmount, setBidAmount] = useState('');
  const [timeLeft, setTimeLeft] = useState(null);

  useEffect(() => {
    // 소켓 이벤트 리스너 설정
    socket.on('room_created', ({ roomId }) => {
      setRoomId(roomId);
      setAlert({ type: 'success', message: `방이 생성되었습니다. 방 코드: ${roomId}` });
    });

    socket.on('game_state_update', (state) => {
      setGameState(state);
      if (!state.currentAuction) {
        setTimeLeft(null);
      }
    });

    socket.on('auction_started', (auction) => {
      setAlert({ type: 'info', message: `${auction.playerName} 선수의 경매가 시작되었습니다!` });
      setTimeLeft(30); // 30초 타이머 시작
    });

    socket.on('bid_update', ({ amount, bidder }) => {
      setAlert({ type: 'info', message: `${bidder}님이 ${amount} 포인트를 입찰했습니다!` });
    });

    socket.on('timer_update', ({ timeLeft }) => {
      setTimeLeft(timeLeft);
    });

    socket.on('auction_finalized', ({ player, winner, amount, autoFinalized }) => {
      setAlert({ 
        type: 'success', 
        message: `${player} 선수가 ${winner}팀에 ${amount} 포인트에 ${autoFinalized ? '자동 ' : ''}낙찰되었습니다!`
      });
      setTimeLeft(null);
    });

    socket.on('auction_cancelled', ({ player, reason }) => {
      setAlert({ type: 'warning', message: reason });
      setTimeLeft(null);
    });

    socket.on('error', ({ message }) => {
      setAlert({ type: 'error', message });
    });

    // 컴포넌트 언마운트 시 이벤트 리스너 제거
    return () => {
      socket.off('room_created');
      socket.off('game_state_update');
      socket.off('auction_started');
      socket.off('bid_update');
      socket.off('timer_update');
      socket.off('auction_finalized');
      socket.off('auction_cancelled');
      socket.off('error');
    };
  }, []);

  // 방 생성 (사회자)
  const createRoom = () => {
    if (!name) {
      setAlert({ type: 'error', message: '이름을 입력해주세요.' });
      return;
    }
    setRole('host');
    socket.emit('create_room');
  };

  // 방 참가 (팀장)
  const joinRoom = () => {
    if (!name || !roomId) {
      setAlert({ type: 'error', message: '이름과 방 코드를 입력해주세요.' });
      return;
    }
    socket.emit('join_room', { roomId, role: 'teamLeader', name });
    setRole('teamLeader');
  };

  // 경매 시작
  const startAuction = () => {
    if (!currentPlayer) {
      setAlert({ type: 'error', message: '선수 이름을 입력해주세요.' });
      return;
    }
    socket.emit('start_auction', { roomId, playerName: currentPlayer, startingBid: 0 });
    setCurrentPlayer('');
  };

  // 입찰
  const placeBid = () => {
    if (!bidAmount || isNaN(bidAmount)) {
      setAlert({ type: 'error', message: '유효한 입찰 금액을 입력해주세요.' });
      return;
    }
    socket.emit('place_bid', { roomId, amount: parseInt(bidAmount) });
    setBidAmount('');
  };

  // 낙찰 처리
  const finalizeAuction = () => {
    socket.emit('finalize_auction', { roomId });
  };

  // 초기 화면 (역할 선택)
  if (!role) {
    return (
      <div className="max-w-md mx-auto p-4 space-y-4">
        <h1 className="text-2xl font-bold text-center">팀 경매 시스템</h1>
        
        {alert && (
          <Alert className="mb-4" variant={alert.type === 'error' ? 'destructive' : 'default'}>
            <AlertTitle>{alert.message}</AlertTitle>
          </Alert>
        )}

        <input
          type="text"
          className="w-full p-2 border rounded"
          placeholder="이름을 입력하세요"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <div className="space-y-2">
          <button
            className="w-full bg-blue-500 text-white p-2 rounded hover:bg-blue-600"
            onClick={createRoom}
          >
            방 만들기 (사회자)
          </button>
          
          <div className="flex gap-2">
            <input
              type="text"
              className="flex-1 p-2 border rounded"
              placeholder="방 코드 입력"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value.toUpperCase())}
            />
            <button
              className="bg-green-500 text-white px-4 rounded hover:bg-green-600"
              onClick={joinRoom}
            >
              참가하기
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 메인 게임 화면
  return (
    <div className="max-w-4xl mx-auto p-4">
      {alert && (
        <Alert className="mb-4" variant={alert.type === 'error' ? 'destructive' : 'default'}>
          <AlertTitle>{alert.message}</AlertTitle>
        </Alert>
      )}

      <div className="mb-4">
        <h2 className="text-xl font-bold">방 코드: {roomId}</h2>
        <p>역할: {role === 'host' ? '사회자' : '팀장'}</p>
      </div>

      {gameState && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
          {Object.entries(gameState.teamLeaders).map(([leaderName, data]) => (
            <div key={leaderName} className="p-4 border rounded">
              <h3 className="font-bold">{leaderName}의 팀</h3>
              <p>남은 포인트: {data.points}</p>
              <p>팀원: {data.team.join(', ') || '없음'}</p>
            </div>
          ))}
        </div>
      )}

      {role === 'host' && (
        <div className="space-y-4">
          <div className="flex gap-2">
            <input
              type="text"
              className="flex-1 p-2 border rounded"
              placeholder="경매할 선수 이름"
              value={currentPlayer}
              onChange={(e) => setCurrentPlayer(e.target.value)}
            />
            <button
              className="bg-blue-500 text-white px-4 rounded hover:bg-blue-600"
              onClick={startAuction}
              disabled={gameState?.currentAuction}
            >
              경매 시작
            </button>
          </div>
        </div>
      )}

      {gameState?.currentAuction && (
        <div className="mt-4 p-4 border rounded space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-bold">
              현재 경매: {gameState.currentAuction.playerName}
            </h3>
            {timeLeft !== null && (
              <div className={`px-3 py-1 rounded ${timeLeft <= 10 ? 'bg-red-500' : 'bg-blue-500'} text-white`}>
                남은 시간: {timeLeft}초
              </div>
            )}
          </div>
          
          <p className="text-lg">
            현재 최고 입찰: {gameState.currentAuction.currentBid} 포인트
            {gameState.currentAuction.currentBidder && (
              ` (입찰자: ${gameState.teamLeaders[gameState.currentAuction.currentBidder]?.name})`
            )}
          </p>

          {role === 'teamLeader' && (
            <div className="flex gap-2">
              <input
                type="number"
                className="flex-1 p-2 border rounded"
                placeholder="입찰 금액"
                value={bidAmount}
                onChange={(e) => setBidAmount(e.target.value)}
              />
              <button
                className="bg-green-500 text-white px-4 rounded hover:bg-green-600"
                onClick={placeBid}
              >
                입찰
              </button>
            </div>
          )}

          {role === 'host' && (
            <button
              className="w-full bg-yellow-500 text-white p-2 rounded hover:bg-yellow-600"
              onClick={finalizeAuction}
            >
              낙찰 확정
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default TeamAuctionLive;