# Team Auction System

실시간 팀 경매 시스템입니다.

## 설치 방법

### 서버

```bash
cd server
npm install
npm start
```

### 클라이언트

```bash
cd client
npm install
npm start
```

## 기능

- 실시간 경매 시스템
- 다중 사용자 지원
- 30초 타이머 자동 낙찰
- 팀 포인트 관리

## 환경 변수

서버:
- PORT: 서버 포트 (기본값: 3001)

클라이언트:
- REACT_APP_SERVER_URL: 서버 URL (개발 환경: http://localhost:3001)