import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';

// Railway 배포용 소켓 연결 설정
const socket = io(window.location.origin, {
  transports: ['websocket', 'polling'],
  secure: true
});

const TeamAuctionLive = () => {
  const [role, setRole] = useState(null); // 'host', 'teamLeader', 'spectator'
  const [name, setName] = useState('');
  const [roomId, setRoomId] = useState('');
  const [gameState, setGameState] = useState(null);
  const [alert, setAlert] = useState(null);
  const [timeLeft, setTimeLeft] = useState(null);
  const [initialPoints, setInitialPoints] = useState(1000);
  const [auctionItems, setAuctionItems] = useState(''); // 경매 물품 목록
  const [bidAmount, setBidAmount] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);  // 익명 경매 여부

  useEffect(() => {
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
      setAlert({ type: 'info', message: `${auction.playerName} 경매가 시작되었습니다!` });
      setTimeLeft(20);
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
        message: `${player}이(가) ${winner}팀에 ${amount} 포인트에 ${autoFinalized ? '자동 ' : ''}낙찰되었습니다!`
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

  const createRoom = () => {
    if (!name) {
      setAlert({ type: 'error', message: '이름을 입력해주세요.' });
      return;
    }
    if (initialPoints < 100) {
      setAlert({ type: 'error', message: '초기 포인트는 최소 100점 이상이어야 합니다.' });
      return;
    }
    if (!auctionItems.trim()) {
      setAlert({ type: 'error', message: '경매 대상을 입력해주세요.' });
      return;
    }
    
    const itemsList = auctionItems.split(',').map(item => item.trim()).filter(item => item);
    if (itemsList.length === 0) {
      setAlert({ type: 'error', message: '최소 한 개 이상의 경매 대상이 필요합니다.' });
      return;
    }

    setRole('host');
    socket.emit('create_room', { initialPoints, items: itemsList, isAnonymous });
  };

  const joinRoom = () => {
    if (!name || !roomId) {
      setAlert({ type: 'error', message: '이름과 방 코드를 입력해주세요.' });
      return;
    }
    socket.emit('join_room', { roomId, role: 'teamLeader', name });
    setRole('teamLeader');
  };

  const startAuction = () => {
    socket.emit('start_auction', { roomId });
  };

  const placeBid = () => {
    if (!bidAmount || isNaN(bidAmount)) {
      setAlert({ type: 'error', message: '유효한 입찰 금액을 입력해주세요.' });
      return;
    }

    const amount = parseInt(bidAmount);
    if (amount % 10 !== 0) {
      setAlert({ type: 'error', message: '입찰 금액은 10의 배수여야 합니다.' });
      return;
    }

    socket.emit('place_bid', { roomId, amount });
    setBidAmount('');
  };

  const finalizeAuction = () => {
    socket.emit('finalize_auction', { roomId });
  };

  if (!role) {
    return (
      <div className="max-w-md mx-auto p-4 space-y-4">
        <h1 className="text-2xl font-bold text-center">오내하 경매 시스템</h1>
        
        {alert && (
          <div className={`mb-4 p-4 rounded ${
            alert.type === 'error' 
              ? 'bg-red-100 text-red-700' 
              : alert.type === 'success'
              ? 'bg-green-100 text-green-700'
              : 'bg-blue-100 text-blue-700'
          }`}>
            {alert.message}
          </div>
        )}

        <input
          type="text"
          className="w-full p-2 border rounded"
          placeholder="이름을 입력하세요"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <div className="space-y-2">
          <div className="space-y-2">
            <input
              type="number"
              className="w-full p-2 border rounded"
              placeholder="팀장 초기 포인트"
              value={initialPoints}
              onChange={(e) => setInitialPoints(parseInt(e.target.value) || 0)}
              min="100"
              step="100"
            />
            <div className="flex items-center gap-2 mb-2">
              <input
                type="checkbox"
                id="anonymous"
                checked={isAnonymous}
                onChange={(e) => setIsAnonymous(e.target.checked)}
              />
              <label htmlFor="anonymous">익명 경매로 진행</label>
            </div>
            <textarea
              className="w-full p-2 border rounded"
              placeholder="경매 물품 목록 (쉼표로 구분)"
              value={auctionItems}
              onChange={(e) => setAuctionItems(e.target.value)}
              rows="3"
            ></textarea>
            <button
              className="w-full bg-blue-500 text-white p-2 rounded hover:bg-blue-600"
              onClick={createRoom}
            >
              방 만들기 (사회자)
            </button>
          </div>
          
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

  return (
    <div className="max-w-7xl mx-auto p-4 flex gap-4">
      {/* 메인 컨텐츠 영역 */}
      <div className="flex-grow">
        {alert && (
          <div className={`mb-4 p-4 rounded ${
            alert.type === 'error' 
              ? 'bg-red-100 text-red-700' 
              : alert.type === 'success'
              ? 'bg-green-100 text-green-700'
              : 'bg-blue-100 text-blue-700'
          }`}>
            {alert.message}
          </div>
        )}

        <div className="mb-4">
          <h2 className="text-xl font-bold">방 코드: {roomId}</h2>
          <p>역할: {role === 'host' ? '사회자' : '팀장'}</p>
        </div>

        {gameState && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            {Object.entries(gameState.teamLeaders).map(([id, data]) => (
              <div key={id} className="p-4 border rounded">
                <h3 className="font-bold">{data.name}의 팀</h3>
                <p>남은 포인트: {data.points}</p>
                <p>팀원: {data.team.join(', ') || '없음'}</p>
              </div>
            ))}
          </div>
        )}

        {role === 'host' && (
          <div className="space-y-4">
            <button
              className="w-full bg-blue-500 text-white p-2 rounded hover:bg-blue-600"
              onClick={startAuction}
              disabled={gameState?.currentAuction}
            >
              다음 경매 시작
            </button>
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
              {gameState.currentAuction.currentBidder && !gameState.isAnonymous && (
                ` (입찰자: ${gameState.teamLeaders[gameState.currentAuction.currentBidder]?.name})`
              )}
            </p>

            {role === 'teamLeader' && (
              <div className="flex gap-2">
                <input
                  type="number"
                  className="flex-1 p-2 border rounded"
                  placeholder="입찰 금액 (10단위)"
                  value={bidAmount}
                  onChange={(e) => setBidAmount(e.target.value)}
                  step="10"
                  min={gameState.currentAuction.currentBid + 10}
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

      {/* 우측 사이드바 - 경매 물품 목록 */}
      {gameState && (
        <div className="w-80 flex-shrink-0">
          <div className="sticky top-4">
            <div className="bg-white p-4 rounded border">
              <h3 className="text-lg font-bold mb-4">경매 현황</h3>
              
              {/* 전체 현황 */}
              <div className="mb-4 p-3 bg-gray-50 rounded">
                <p>전체 경매: {gameState.totalItems}개</p>
                <p>남은 경매: {gameState.remainingItemsCount}개</p>
                {gameState.isAnonymous && <p className="text-sm text-gray-600">익명 경매 진행 중</p>}
              </div>

              {/* 남은 경매 목록 */}
              <div className="mb-4">
                <h4 className="font-medium text-gray-700 mb-2">남은 경매 물품</h4>
                <div className="space-y-2">
                  {gameState.remainingItems.map((item, index) => (
                    <div key={`remaining-${index}`} className="p-2 bg-gray-50 rounded text-sm">
                      {item}
                    </div>
                  ))}
                </div>
              </div>

              {/* 실패한 경매 목록 */}
              {gameState.failedItems.length > 0 && (
                <div className="mb-4">
                  <h4 className="font-medium text-gray-700 mb-2">유찰된 경매</h4>
                  <div className="space-y-2">
                    {gameState.failedItems.map((item, index) => (
                      <div key={`failed-${index}`} className="p-2 bg-red-50 rounded text-sm">
                        {item}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 완료된 경매 목록 */}
              <div className="space-y-2">
                <h4 className="font-medium text-gray-700">완료된 경매</h4>
                {gameState.completedItems.map((item, index) => (
                  <div key={`completed-${index}`} className="p-2 bg-green-50 rounded text-sm">
                    <div className="font-medium">{item.item}</div>
                    <div className="text-gray-600">
                      {item.winner} - {item.amount} 포인트
                      </div>
                    <div className="text-xs text-gray-500">
                      {new Date(item.timestamp).toLocaleString()}
                    </div>
                  </div>
                ))}
                {gameState.completedItems.length === 0 && (
                  <div className="text-sm text-gray-500 p-2">
                    아직 완료된 경매가 없습니다.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TeamAuctionLive;