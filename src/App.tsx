import React, { useEffect, useState, useRef } from 'react';
import Peer, { DataConnection } from 'peerjs';
import { v4 as uuidv4 } from 'uuid';
import { RoomState, PlayerState, DiceFace, ScoreCategory, CATEGORIES } from './types';
import { motion, AnimatePresence } from 'framer-motion';
import { Dices, Trophy, User, AlertCircle, Check, Wifi, WifiOff } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Game Logic Helpers ---
function calculatePotentialScore(dice: DiceFace[], category: ScoreCategory): number {
  const counts = [0, 0, 0, 0, 0, 0, 0];
  let sum = 0;
  for (const d of dice) {
    counts[d]++;
    sum += d;
  }

  switch (category) {
    case 'ones': return counts[1] * 1;
    case 'twos': return counts[2] * 2;
    case 'threes': return counts[3] * 3;
    case 'fours': return counts[4] * 4;
    case 'fives': return counts[5] * 5;
    case 'sixes': return counts[6] * 6;
    case 'choice': return sum;
    case 'fourOfAKind': return counts.some(c => c >= 4) ? sum : 0;
    case 'fullHouse': return (counts.some(c => c === 3) && counts.some(c => c === 2)) || counts.some(c => c === 5) ? 25 : 0;
    case 'smallStraight': {
      const s = counts.slice(1).map(c => c > 0 ? '1' : '0').join('');
      return s.includes('1111') ? 30 : 0;
    }
    case 'largeStraight': {
      const s2 = counts.slice(1).map(c => c > 0 ? '1' : '0').join('');
      return s2.includes('11111') ? 40 : 0;
    }
    case 'yacht': return counts.some(c => c === 5) ? 50 : 0;
  }
  return 0;
}

function getUpperSum(player: PlayerState): number {
  let sum = 0;
  const upperCats: ScoreCategory[] = ['ones', 'twos', 'threes', 'fours', 'fives', 'sixes'];
  for (const cat of upperCats) {
    sum += player.scores[cat] || 0;
  }
  return sum;
}

function getTotalScore(player: PlayerState): number {
  let sum = 0;
  for (const score of Object.values(player.scores)) {
    sum += score || 0;
  }
  const bonus = getUpperSum(player) >= 63 ? 35 : 0;
  return sum + bonus;
}

function createPlayer(id: string, name: string): PlayerState {
  return {
    id,
    name,
    dice: [1, 1, 1, 1, 1],
    held: [false, false, false, false, false],
    rollsLeft: 3,
    scores: {},
    ready: false,
    hasRolled: false
  };
}

// --- Session Storage ---
interface SessionData {
  roomId: string;
  playerName: string;
  role: 'host' | 'guest';
  myId: string;
}

const SESSION_KEY = 'YACHT_SESSION';
function getSession(): SessionData | null {
  const s = sessionStorage.getItem(SESSION_KEY);
  return s ? JSON.parse(s) : null;
}
function setSession(data: SessionData) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(data));
}
function clearSession() {
  sessionStorage.removeItem(SESSION_KEY);
}

// --- Main App ---
export default function App() {
  const [session, setSessionState] = useState<SessionData | null>(getSession());
  
  if (!session) {
    return <JoinScreen onJoin={(data) => {
      setSession(data);
      setSessionState(data);
    }} />;
  }

  return <GameContainer session={session} onLeave={() => {
    localStorage.removeItem(`YACHT_STATE_${session.roomId}`);
    clearSession();
    setSessionState(null);
  }} />;
}

// --- Join Screen ---
function JoinScreen({ onJoin }: { onJoin: (data: SessionData) => void }) {
  const [roomId, setRoomId] = useState('8888');
  const [isHost, setIsHost] = useState(true);

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomId.trim()) return;
    
    const myId = isHost ? `host-${uuidv4().slice(0,8)}` : `guest-${uuidv4().slice(0,8)}`;
    onJoin({
      roomId: roomId.toUpperCase(),
      playerName: isHost ? '房主' : '访客',
      role: isHost ? 'host' : 'guest',
      myId
    });
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-emerald-50 to-teal-100 text-neutral-800 flex items-center justify-center p-4 font-sans">
      <div className="max-w-md w-full bg-white/80 backdrop-blur-md p-8 rounded-3xl shadow-xl border border-white">
        <div className="flex flex-col items-center justify-center mb-8">
          <Dices className="w-16 h-16 text-emerald-500 mb-4 drop-shadow-sm" />
          <h1 className="text-4xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-br from-emerald-600 to-teal-800">快艇骰子</h1>
          <p className="text-emerald-600/80 mt-2 font-medium">P2P 联机对战</p>
        </div>
        
        <div className="flex gap-2 mb-6 bg-emerald-100/50 p-1 rounded-xl">
          <button 
            onClick={() => setIsHost(true)}
            className={cn("flex-1 py-2 rounded-lg font-bold text-sm transition-all", isHost ? "bg-white text-emerald-700 shadow-sm" : "text-emerald-600/60 hover:text-emerald-700")}
          >
            创建房间
          </button>
          <button 
            onClick={() => setIsHost(false)}
            className={cn("flex-1 py-2 rounded-lg font-bold text-sm transition-all", !isHost ? "bg-white text-emerald-700 shadow-sm" : "text-emerald-600/60 hover:text-emerald-700")}
          >
            加入房间
          </button>
        </div>

        <form onSubmit={handleJoin} className="space-y-6">
          <div>
            <label className="block text-sm font-bold text-emerald-800 mb-2 uppercase tracking-wider">房间号</label>
            <input
              type="text"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value.toUpperCase())}
              className="w-full bg-white/60 border-2 border-emerald-200 rounded-xl px-4 py-3 text-neutral-900 focus:outline-none focus:border-emerald-500 transition-all uppercase placeholder:text-neutral-400 font-medium"
              placeholder="例如：8888"
              maxLength={8}
              required
            />
          </div>

          <button
            type="submit"
            className="w-full bg-gradient-to-b from-emerald-400 to-emerald-600 hover:from-emerald-500 hover:to-emerald-700 text-white font-bold py-4 px-4 rounded-xl transition-all shadow-lg hover:shadow-xl active:scale-95"
          >
            {isHost ? '创建并主持' : '加入牌桌'}
          </button>
        </form>
      </div>
    </div>
  );
}

// --- Game Container (P2P Logic) ---
function GameContainer({ session, onLeave }: { session: SessionData, onLeave: () => void }) {
  const [room, setRoom] = useState<RoomState | null>(null);
  const [error, setError] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  
  const peerRef = useRef<Peer | null>(null);
  const connRef = useRef<DataConnection | null>(null);
  const connectionsRef = useRef<Set<DataConnection>>(new Set());
  const gameStateRef = useRef<RoomState | null>(null);

  const hostPeerId = `yacht-room-${session.roomId}`;
  const LOCAL_STORAGE_KEY = `YACHT_STATE_${session.roomId}`;

  useEffect(() => {
    if (session.role === 'host') {
      initHost();
    } else {
      initGuest();
    }

    return () => {
      peerRef.current?.destroy();
    };
  }, []);

  // --- HOST LOGIC ---
  const initHost = () => {
    const peer = new Peer(hostPeerId);
    peerRef.current = peer;

    // Load or create state
    let state: RoomState;
    const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (saved) {
      state = JSON.parse(saved);
      if (state.status === 'player_left') {
        state = {
          id: session.roomId,
          players: { [session.myId]: createPlayer(session.myId, session.playerName) },
          playerOrder: [session.myId],
          status: 'waiting',
          currentRound: 1,
          activePlayerIndex: 0
        };
      } else {
        // Ensure host is in the room if restoring
        if (!state.players[session.myId]) {
          state.players[session.myId] = createPlayer(session.myId, session.playerName);
          if (!state.playerOrder.includes(session.myId)) {
            state.playerOrder.unshift(session.myId);
          }
        }
      }
    } else {
      state = {
        id: session.roomId,
        players: { [session.myId]: createPlayer(session.myId, session.playerName) },
        playerOrder: [session.myId],
        status: 'waiting',
        currentRound: 1,
        activePlayerIndex: 0
      };
    }
    
    gameStateRef.current = state;
    setRoom(state);
    setIsConnected(true);

    const broadcast = (newState: RoomState) => {
      gameStateRef.current = newState;
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(newState));
      setRoom({...newState});
      connectionsRef.current.forEach(c => {
        if (c.open) c.send({ type: 'STATE', payload: newState });
      });
    };

    peer.on('connection', (conn) => {
      connectionsRef.current.add(conn);
      
      conn.on('open', () => {
        // Send current state immediately
        if (gameStateRef.current) {
          conn.send({ type: 'STATE', payload: gameStateRef.current });
        }
      });

      conn.on('data', (data: any) => {
        const currentState = gameStateRef.current;
        if (!currentState) return;

        if (data.type === 'JOIN') {
          const newState = JSON.parse(JSON.stringify(currentState));
          const { id, name } = data.payload;
          if (!newState.players[id]) {
            if (newState.playerOrder.length < 2) {
              newState.players[id] = createPlayer(id, name);
              newState.playerOrder.push(id);
              if (newState.playerOrder.length === 2 && newState.status === 'waiting') {
                newState.status = 'playing';
              }
            }
          } else {
            newState.players[id].name = name; // Update name on reconnect
          }
          broadcast(newState);
        } 
        else if (data.type === 'ACTION') {
          const newState = JSON.parse(JSON.stringify(currentState));
          handleGameAction(newState, data.payload.action, data.payload.playerId, data.payload.value);
          broadcast(newState);
        }
      });

      conn.on('close', () => {
        connectionsRef.current.delete(conn);
      });
    });

    peer.on('error', (err) => {
      if (err.type === 'unavailable-id') {
        setError('该房间号已被占用，请尝试其他房间号。');
      } else {
        setError(`连接错误: ${err.message}`);
      }
    });
  };

  // --- GUEST LOGIC ---
  const initGuest = () => {
    const peer = new Peer(session.myId);
    peerRef.current = peer;

    peer.on('open', () => {
      connectToHost(peer);
    });

    peer.on('error', (err) => {
      setError(`连接错误: ${err.message}`);
      setIsConnected(false);
    });
  };

  const connectToHost = (peer: Peer) => {
    const conn = peer.connect(hostPeerId, { reliable: true });
    connRef.current = conn;

    conn.on('open', () => {
      setIsConnected(true);
      setError('');
      conn.send({ type: 'JOIN', payload: { id: session.myId, name: session.playerName } });
    });

    conn.on('data', (data: any) => {
      if (data.type === 'STATE') {
        setRoom(data.payload);
      }
    });

    conn.on('close', () => {
      setIsConnected(false);
      // Auto reconnect
      setTimeout(() => {
        if (peerRef.current && !peerRef.current.destroyed) {
          connectToHost(peerRef.current);
        }
      }, 3000);
    });
  };

  // --- Game Actions (Host executes these) ---
  const handleGameAction = (state: RoomState, action: string, playerId: string, value?: any) => {
    if (action === 'LEAVE_ROOM') {
      state.status = 'player_left';
      return;
    }

    if (state.status !== 'playing' && action !== 'PLAY_AGAIN') return;
    
    if (action === 'ROLL') {
      const player = state.players[playerId];
      if (!player || player.rollsLeft <= 0) return;
      player.dice = player.dice.map((d, i) => player.held[i] ? d : Math.floor(Math.random() * 6) + 1 as DiceFace);
      player.rollsLeft--;
      player.hasRolled = true;
    } 
    else if (action === 'TOGGLE_HOLD') {
      const player = state.players[playerId];
      if (!player || !player.hasRolled || player.rollsLeft <= 0) return;
      player.held[value] = !player.held[value];
    }
    else if (action === 'SCORE') {
      const player = state.players[playerId];
      const category = value as ScoreCategory;
      if (!player || !player.hasRolled || player.scores[category] !== undefined) return;
      
      player.scores[category] = calculatePotentialScore(player.dice, category);
      
      // Reset turn
      player.dice = [1,1,1,1,1];
      player.held = [false,false,false,false,false];
      player.rollsLeft = 3;
      player.hasRolled = false;
      
      // Next turn
      state.activePlayerIndex = (state.activePlayerIndex + 1) % state.playerOrder.length;
      
      // Check round end
      if (state.activePlayerIndex === 0) {
        state.currentRound++;
        if (state.currentRound > 12) {
          state.status = 'game_over';
          const p1 = state.players[state.playerOrder[0]];
          const p2 = state.players[state.playerOrder[1]];
          const s1 = getTotalScore(p1);
          const s2 = getTotalScore(p2);
          if (s1 > s2) state.winner = p1.id;
          else if (s2 > s1) state.winner = p2.id;
          else state.winner = 'tie';
        }
      }
    }
    else if (action === 'PLAY_AGAIN') {
      const player = state.players[playerId];
      if (!player) return;
      player.ready = true;
      
      const allReady = state.playerOrder.every(id => state.players[id].ready);
      if (allReady) {
        state.status = 'playing';
        state.currentRound = 1;
        state.activePlayerIndex = 0;
        state.winner = undefined;
        state.playerOrder.forEach(id => {
          const p = state.players[id];
          p.scores = {};
          p.ready = false;
          p.dice = [1,1,1,1,1];
          p.held = [false,false,false,false,false];
          p.rollsLeft = 3;
          p.hasRolled = false;
        });
      }
    }
  };

  // --- Dispatch Action ---
  const dispatchAction = (action: string, value?: any) => {
    if (session.role === 'host') {
      if (gameStateRef.current) {
        const newState = JSON.parse(JSON.stringify(gameStateRef.current)); // deep copy
        handleGameAction(newState, action, session.myId, value);
        
        gameStateRef.current = newState;
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(newState));
        setRoom(newState);
        connectionsRef.current.forEach(c => {
          if (c.open) c.send({ type: 'STATE', payload: newState });
        });
      }
    } else {
      if (connRef.current?.open) {
        connRef.current.send({ type: 'ACTION', payload: { action, playerId: session.myId, value } });
      }
    }
  };

  if (error && !room) {
    return (
      <div className="min-h-screen bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-emerald-50 to-teal-100 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center">
          <AlertCircle className="w-12 h-12 text-rose-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-neutral-800 mb-2">连接错误</h2>
          <p className="text-neutral-600 mb-6">{error}</p>
          <button onClick={onLeave} className="bg-emerald-500 text-white px-6 py-2 rounded-lg font-bold">返回</button>
        </div>
      </div>
    );
  }

  if (!room) {
    return (
      <div className="min-h-screen bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-emerald-50 to-teal-100 flex items-center justify-center">
        <div className="animate-pulse flex flex-col items-center">
          <Dices className="w-16 h-16 text-emerald-500 mb-4" />
          <p className="text-emerald-800 font-bold">正在连接 P2P 网络...</p>
        </div>
      </div>
    );
  }

  return <GameBoard room={room} myId={session.myId} dispatchAction={dispatchAction} isConnected={isConnected} onLeave={onLeave} />;
}

// --- Game Board UI ---
function GameBoard({ room, myId, dispatchAction, isConnected, onLeave }: { room: RoomState; myId: string; dispatchAction: (action: string, val?: any) => void; isConnected: boolean; onLeave: () => void }) {
  const me = room.players[myId];

  // If the guest just connected, the host might have sent the initial state 
  // before processing the guest's JOIN message. We wait until 'me' exists.
  if (!me) {
    return (
      <div className="min-h-screen bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-emerald-50 to-teal-100 flex items-center justify-center p-4">
        <div className="animate-pulse flex flex-col items-center">
          <Dices className="w-16 h-16 text-emerald-500 mb-4" />
          <p className="text-emerald-800 font-bold">正在同步游戏状态...</p>
        </div>
      </div>
    );
  }

  const opponentId = room.playerOrder.find(id => id !== myId);
  const opponent = opponentId ? room.players[opponentId] : null;

  const isActivePlayer = room.playerOrder[room.activePlayerIndex] === myId;
  const activePlayer = room.players[room.playerOrder[room.activePlayerIndex]];

  const handleLeaveClick = () => {
    dispatchAction('LEAVE_ROOM');
    setTimeout(onLeave, 200);
  };

  if (room.status === 'waiting' || !activePlayer) {
    return (
      <div className="min-h-screen bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-emerald-50 to-teal-100 text-neutral-800 flex flex-col items-center justify-center p-4">
        <div className="absolute top-4 right-4">
          <button onClick={handleLeaveClick} className="text-emerald-700 bg-white/50 px-4 py-2 rounded-lg font-bold text-sm hover:bg-white transition-colors">离开房间</button>
        </div>
        <div className="animate-pulse flex flex-col items-center">
          <Dices className="w-20 h-20 text-emerald-500 mb-6 drop-shadow-sm" />
          <h2 className="text-3xl font-bold mb-4 text-emerald-900">等待对手加入...</h2>
          <div className="bg-white/60 border border-emerald-200 px-6 py-3 rounded-2xl flex items-center shadow-sm mb-4">
            <span className="text-emerald-700 mr-3 font-medium uppercase tracking-wider text-sm">房间号</span>
            <span className="font-mono text-2xl font-bold text-emerald-900 tracking-widest">{room.id}</span>
          </div>
          <p className="text-emerald-600/80 text-sm">将此房间号分享给好友，让他们选择“加入房间”。</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-emerald-50 to-teal-100 text-neutral-800 flex flex-col font-sans overflow-hidden">
      {/* Header */}
      <header className="bg-white/60 backdrop-blur-md border-b border-emerald-100 p-4 flex justify-between items-center z-10 shadow-sm">
        <div className="flex items-center">
          <Dices className="w-6 h-6 text-emerald-500 mr-3" />
          <span className="font-black text-xl tracking-tight text-transparent bg-clip-text bg-gradient-to-br from-emerald-600 to-teal-800">快艇骰子</span>
        </div>
        <div className="flex items-center gap-4">
          {!isConnected && (
            <div className="flex items-center text-rose-500 bg-rose-50 px-3 py-1 rounded-full text-xs font-bold border border-rose-200">
              <WifiOff className="w-3 h-3 mr-1" /> 重新连接中...
            </div>
          )}
          <div className="text-emerald-800 font-bold bg-emerald-100 px-4 py-1.5 rounded-full border border-emerald-200">
            回合 <span className="text-emerald-950 ml-1">{room.currentRound} / 12</span>
          </div>
          <button onClick={handleLeaveClick} className="text-emerald-700 bg-white/50 px-3 py-1.5 rounded-lg font-bold text-xs hover:bg-white transition-colors border border-emerald-200">离开</button>
        </div>
      </header>

      {/* Main Game Area */}
      <main className="flex-1 flex flex-col lg:flex-row overflow-hidden relative">
        
        {/* Left/Top: Scorecard */}
        <div className={cn(
          "flex-shrink-0 bg-white/40 border-r border-emerald-100 overflow-y-auto custom-scrollbar",
          room.status === 'game_over' ? "w-full lg:w-1/2" : "w-full lg:w-[400px]"
        )}>
          <Scorecard room={room} myId={myId} opponent={opponent} me={me} isActivePlayer={isActivePlayer} dispatchAction={dispatchAction} />
        </div>

        {/* Right/Bottom: Table & Dice OR Game Over */}
        <div className={cn(
          "flex-1 flex flex-col items-center justify-center relative p-4 lg:p-8",
          room.status === 'game_over' ? "bg-white/60" : ""
        )}>
          {room.status === 'game_over' ? (
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-white p-10 rounded-[2rem] shadow-2xl max-w-md w-full text-center border border-neutral-200"
            >
              <Trophy className={cn(
                "w-24 h-24 mx-auto mb-6 drop-shadow-md",
                room.winner === myId ? "text-yellow-400" : room.winner === 'tie' ? "text-neutral-400" : "text-rose-400"
              )} />
              
              <h2 className="text-5xl font-black mb-3 text-transparent bg-clip-text bg-gradient-to-br from-emerald-600 to-teal-800">
                {room.winner === myId ? '胜利！' : room.winner === 'tie' ? '平局！' : '失败！'}
              </h2>
              
              <div className="flex justify-center items-center gap-8 my-8">
                <div className="text-center">
                  <p className="text-neutral-500 text-sm font-bold uppercase tracking-wider mb-1">你</p>
                  <p className="text-4xl font-black text-emerald-500">{getTotalScore(me)}</p>
                </div>
                <div className="w-px h-12 bg-neutral-200"></div>
                <div className="text-center">
                  <p className="text-neutral-500 text-sm font-bold uppercase tracking-wider mb-1">{opponent?.name}</p>
                  <p className="text-4xl font-black text-rose-500">{opponent ? getTotalScore(opponent) : 0}</p>
                </div>
              </div>

              <div className="space-y-3">
                <button
                  onClick={() => dispatchAction('PLAY_AGAIN')}
                  className={cn(
                    "w-full font-black py-4 px-8 rounded-2xl transition-all text-lg uppercase tracking-wider shadow-lg",
                    me.ready 
                      ? "bg-neutral-200 text-neutral-400 cursor-not-allowed border border-neutral-300"
                      : "bg-gradient-to-b from-emerald-400 to-emerald-600 hover:from-emerald-500 hover:to-emerald-700 text-white shadow-emerald-500/30 active:scale-95"
                  )}
                  disabled={me.ready}
                >
                  {me.ready ? '等待中...' : '再来一局'}
                </button>
                <button
                  onClick={handleLeaveClick}
                  className="w-full font-black py-4 px-8 rounded-2xl transition-all text-lg uppercase tracking-wider bg-white border-2 border-rose-200 text-rose-500 hover:bg-rose-50 hover:border-rose-300 active:scale-95"
                >
                  离开房间
                </button>
              </div>
            </motion.div>
          ) : (
            <div className="flex-1 w-full max-w-3xl flex flex-col items-center justify-center">
              
              {/* Turn Indicator */}
              <motion.div 
                key={activePlayer.id}
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white/90 backdrop-blur-md border border-emerald-200 px-6 py-2 rounded-full shadow-md z-20 flex items-center mb-8"
              >
                <User className={cn("w-5 h-5 mr-3", isActivePlayer ? "text-emerald-500" : "text-rose-500")} />
                <span className="font-bold text-lg text-neutral-800">
                  {isActivePlayer ? "你的回合" : `等待 ${activePlayer.name} 操作`}
                </span>
              </motion.div>

              {/* Dice Area */}
              <div className="flex flex-wrap justify-center gap-4 sm:gap-6 mb-12 min-h-[120px]">
                <AnimatePresence>
                  {activePlayer.dice.map((face, i) => (
                    <Dice 
                      key={`${activePlayer.id}-${i}-${activePlayer.rollsLeft}`} 
                      face={face} 
                      held={activePlayer.held[i]} 
                      hidden={!activePlayer.hasRolled}
                      onClick={() => {
                        if (isActivePlayer && activePlayer.hasRolled && activePlayer.rollsLeft > 0) {
                          dispatchAction('TOGGLE_HOLD', i);
                        }
                      }}
                      interactive={isActivePlayer && activePlayer.hasRolled && activePlayer.rollsLeft > 0}
                      index={i}
                    />
                  ))}
                </AnimatePresence>
              </div>

              {/* Controls */}
              <div className="h-24 flex items-center justify-center w-full max-w-sm">
                {isActivePlayer ? (
                  <div className="w-full flex flex-col gap-3">
                    <button
                      onClick={() => dispatchAction('ROLL')}
                      disabled={activePlayer.rollsLeft === 0 || !isConnected}
                      className={cn(
                        "w-full font-black py-4 px-8 rounded-2xl shadow-lg transition-all active:scale-95 flex items-center justify-center text-xl uppercase tracking-wider",
                        activePlayer.rollsLeft > 0 && isConnected
                          ? "bg-gradient-to-b from-emerald-400 to-emerald-600 hover:from-emerald-500 hover:to-emerald-700 text-white shadow-emerald-500/30"
                          : "bg-neutral-200 text-neutral-400 cursor-not-allowed border border-neutral-300"
                      )}
                    >
                      <Dices className="w-6 h-6 mr-3" />
                      {!activePlayer.hasRolled 
                        ? '掷骰子' 
                        : activePlayer.rollsLeft > 0 
                          ? `重掷 (剩余 ${activePlayer.rollsLeft} 次)` 
                          : '请选择得分项'}
                    </button>
                    {activePlayer.hasRolled && activePlayer.rollsLeft > 0 && (
                      <p className="text-center text-emerald-700/80 text-sm font-medium">
                        在左侧选择一个计分项，或者重新掷骰子。
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="text-emerald-700/80 font-medium text-lg flex items-center">
                    <div className="w-2 h-2 bg-emerald-500 rounded-full animate-ping mr-3" />
                    等待 {activePlayer.name} 操作...
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

      </main>

      {/* Player Left Overlay */}
      <AnimatePresence>
        {room.status === 'player_left' && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 bg-white/80 backdrop-blur-md flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-white p-10 rounded-[2rem] shadow-2xl max-w-md w-full text-center border border-neutral-200"
            >
              <AlertCircle className="w-24 h-24 mx-auto mb-6 text-rose-400 drop-shadow-md" />
              <h2 className="text-3xl font-black mb-3 text-neutral-800">对局已结束</h2>
              <p className="text-neutral-500 mb-8">对方已离开房间</p>
              <button
                onClick={onLeave}
                className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-black py-4 px-8 rounded-2xl transition-all text-lg shadow-lg"
              >
                返回首页
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Scorecard({ room, myId, opponent, me, isActivePlayer, dispatchAction }: { room: RoomState, myId: string, opponent: PlayerState | null, me: PlayerState, isActivePlayer: boolean, dispatchAction: (action: string, val?: any) => void }) {
  
  const renderRow = (cat: typeof CATEGORIES[0]) => {
    const myScore = me.scores[cat.id];
    const oppScore = opponent?.scores[cat.id];
    
    const canScore = isActivePlayer && me.hasRolled && myScore === undefined;
    const potentialScore = canScore ? calculatePotentialScore(me.dice, cat.id) : null;

    return (
      <div key={cat.id} className="grid grid-cols-[1fr_80px_80px] border-b border-emerald-100 hover:bg-emerald-50/50 transition-colors group">
        <div className="py-3 px-4 flex flex-col justify-center">
          <span className="font-bold text-neutral-800 text-sm">{cat.name}</span>
          <span className="text-[10px] text-neutral-500 uppercase tracking-wider">{cat.description}</span>
        </div>
        
        {/* My Score Column */}
        <div 
          className={cn(
            "border-l border-emerald-100 flex items-center justify-center relative",
            canScore ? "cursor-pointer hover:bg-amber-50" : ""
          )}
          onClick={() => {
            if (canScore) {
              dispatchAction('SCORE', cat.id);
            }
          }}
        >
          {myScore !== undefined ? (
            <span className="font-black text-xl text-emerald-800">{myScore}</span>
          ) : canScore ? (
            <span className="font-bold text-lg text-amber-500 bg-amber-100/50 px-2 py-0.5 rounded border border-amber-200 group-hover:bg-amber-200 transition-colors">{potentialScore}</span>
          ) : (
            <span className="text-neutral-300">-</span>
          )}
        </div>

        {/* Opponent Score Column */}
        <div className="border-l border-emerald-100 flex items-center justify-center bg-neutral-50/50">
          {oppScore !== undefined ? (
            <span className="font-black text-xl text-rose-600">{oppScore}</span>
          ) : (
            <span className="text-neutral-300">-</span>
          )}
        </div>
      </div>
    );
  };

  const myUpperSum = getUpperSum(me);
  const oppUpperSum = opponent ? getUpperSum(opponent) : 0;

  return (
    <div className="p-4 lg:p-6 pb-24 lg:pb-6">
      <div className="bg-white rounded-2xl border border-emerald-200 shadow-xl overflow-hidden">
        
        {/* Table Header */}
        <div className="grid grid-cols-[1fr_80px_80px] bg-emerald-50 border-b border-emerald-200">
          <div className="py-4 px-4 font-black text-emerald-800 uppercase tracking-widest text-sm">计分项</div>
          <div className="py-4 flex justify-center items-center border-l border-emerald-200 bg-emerald-100/50">
            <User className="w-5 h-5 text-emerald-600" />
          </div>
          <div className="py-4 flex justify-center items-center border-l border-emerald-200 bg-rose-50">
            <User className="w-5 h-5 text-rose-500" />
          </div>
        </div>

        {/* Upper Section */}
        <div className="bg-white">
          {CATEGORIES.slice(0, 6).map(renderRow)}
          
          {/* Subtotal & Bonus */}
          <div className="grid grid-cols-[1fr_80px_80px] border-b-2 border-emerald-200 bg-emerald-50/30">
            <div className="py-3 px-4 flex flex-col justify-center">
              <span className="font-bold text-emerald-800 text-sm">奖励分 (&gt;=63)</span>
              <span className="text-[10px] text-emerald-600 uppercase tracking-wider">+35 分</span>
            </div>
            <div className="border-l border-emerald-100 flex items-center justify-center">
              <span className={cn("font-black text-lg", myUpperSum >= 63 ? "text-emerald-600" : "text-neutral-400")}>
                {myUpperSum >= 63 ? '35' : `${myUpperSum}/63`}
              </span>
            </div>
            <div className="border-l border-emerald-100 flex items-center justify-center bg-neutral-50/50">
              <span className={cn("font-black text-lg", oppUpperSum >= 63 ? "text-rose-500" : "text-neutral-400")}>
                {oppUpperSum >= 63 ? '35' : `${oppUpperSum}/63`}
              </span>
            </div>
          </div>
        </div>

        {/* Lower Section */}
        <div className="bg-white">
          {CATEGORIES.slice(6).map(renderRow)}
        </div>

        {/* Total Score */}
        <div className="grid grid-cols-[1fr_80px_80px] bg-emerald-50 border-t-2 border-emerald-200">
          <div className="py-5 px-4 font-black text-emerald-900 uppercase tracking-widest text-lg">总分</div>
          <div className="py-5 flex justify-center items-center border-l border-emerald-200 bg-emerald-100/50">
            <span className="font-black text-2xl text-emerald-600">{getTotalScore(me)}</span>
          </div>
          <div className="py-5 flex justify-center items-center border-l border-emerald-200 bg-rose-50">
            <span className="font-black text-2xl text-rose-500">{opponent ? getTotalScore(opponent) : 0}</span>
          </div>
        </div>

      </div>
    </div>
  );
}

function Dice({ face, held, hidden, onClick, interactive, index }: { 
  key?: React.Key;
  face: DiceFace; 
  held: boolean; 
  hidden?: boolean;
  onClick?: () => void;
  interactive?: boolean;
  index: number;
}) {
  
  // Pip layouts for 1-6
  const pips = {
    1: ['col-start-2 row-start-2'],
    2: ['col-start-1 row-start-1', 'col-start-3 row-start-3'],
    3: ['col-start-1 row-start-1', 'col-start-2 row-start-2', 'col-start-3 row-start-3'],
    4: ['col-start-1 row-start-1', 'col-start-3 row-start-1', 'col-start-1 row-start-3', 'col-start-3 row-start-3'],
    5: ['col-start-1 row-start-1', 'col-start-3 row-start-1', 'col-start-2 row-start-2', 'col-start-1 row-start-3', 'col-start-3 row-start-3'],
    6: ['col-start-1 row-start-1', 'col-start-1 row-start-2', 'col-start-1 row-start-3', 'col-start-3 row-start-1', 'col-start-3 row-start-2', 'col-start-3 row-start-3'],
  };

  return (
    <motion.div
      layout
      onClick={onClick}
      initial={{ opacity: 0, scale: 0.5, rotate: -180 }}
      animate={{ 
        opacity: 1, 
        scale: held ? 0.9 : 1,
        y: held ? 15 : 0,
        rotate: hidden ? 0 : (Math.random() * 10 - 5) // Slight random rotation for realism
      }}
      transition={{ 
        type: "spring", 
        stiffness: 400, 
        damping: 25,
        delay: index * 0.05 // Stagger entrance
      }}
      className={cn(
        "relative w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 rounded-2xl sm:rounded-3xl shadow-[0_10px_20px_rgba(0,0,0,0.1),inset_0_-4px_0_rgba(0,0,0,0.05)] flex items-center justify-center select-none",
        interactive ? "cursor-pointer hover:-translate-y-2 hover:shadow-[0_15px_25px_rgba(0,0,0,0.15),inset_0_-4px_0_rgba(0,0,0,0.05)] transition-all" : "",
        held ? "bg-emerald-50 border-4 border-emerald-500 shadow-[0_5px_10px_rgba(16,185,129,0.2),inset_0_-4px_0_rgba(0,0,0,0.05)]" : "bg-gradient-to-br from-white to-neutral-100 border border-neutral-200",
        hidden ? "bg-neutral-200 border-neutral-300 from-neutral-200 to-neutral-300" : ""
      )}
    >
      {!hidden && (
        <div className="grid grid-cols-3 grid-rows-3 gap-1 sm:gap-1.5 md:gap-2 w-3/5 h-3/5">
          {pips[face].map((pos, i) => (
            <div key={i} className={cn("bg-neutral-800 rounded-full shadow-[inset_0_2px_4px_rgba(0,0,0,0.3)]", pos)} />
          ))}
        </div>
      )}
      
      {hidden && (
        <Dices className="w-8 h-8 sm:w-10 sm:h-10 text-neutral-400" />
      )}

      {held && !hidden && (
        <div className="absolute -top-4 bg-emerald-500 text-white text-xs font-black px-3 py-1 rounded-full uppercase tracking-widest shadow-md flex items-center">
          <Check className="w-3 h-3 mr-1" /> 保留
        </div>
      )}
    </motion.div>
  );
}
