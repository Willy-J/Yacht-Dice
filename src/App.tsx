import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { RoomState, PlayerState, DiceFace, ScoreCategory, CATEGORIES } from './types';
import { motion, AnimatePresence } from 'framer-motion';
import { Dices, Trophy, User, AlertCircle, Check } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

let socket: Socket;

// Helper to calculate potential score on client side
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

export default function App() {
  const [roomId, setRoomId] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [room, setRoom] = useState<RoomState | null>(null);
  const [error, setError] = useState('');
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    socket = io();

    socket.on('connect', () => {
      setIsConnected(true);
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
      setRoom(null);
    });

    socket.on('room_state', (state: RoomState) => {
      setRoom(state);
      setError('');
    });

    socket.on('error', (msg: string) => {
      setError(msg);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomId.trim() || !playerName.trim()) return;
    socket.emit('join_room', { roomId, playerName });
  };

  if (!room) {
    return (
      <div className="min-h-screen bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-emerald-50 to-teal-100 text-neutral-800 flex items-center justify-center p-4 font-sans">
        <div className="max-w-md w-full bg-white/80 backdrop-blur-md p-8 rounded-3xl shadow-xl border border-white">
          <div className="flex flex-col items-center justify-center mb-8">
            <Dices className="w-16 h-16 text-emerald-500 mb-4 drop-shadow-sm" />
            <h1 className="text-4xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-br from-emerald-600 to-teal-800">Yacht Dice</h1>
            <p className="text-emerald-600/80 mt-2 font-medium">快艇骰子</p>
          </div>
          
          <form onSubmit={handleJoin} className="space-y-6">
            <div>
              <label className="block text-sm font-bold text-emerald-800 mb-2 uppercase tracking-wider">Player Name</label>
              <input
                type="text"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                className="w-full bg-white/60 border-2 border-emerald-200 rounded-xl px-4 py-3 text-neutral-900 focus:outline-none focus:border-emerald-500 transition-all placeholder:text-neutral-400 font-medium"
                placeholder="Enter your name"
                maxLength={12}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-emerald-800 mb-2 uppercase tracking-wider">Room Code</label>
              <input
                type="text"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value.toUpperCase())}
                className="w-full bg-white/60 border-2 border-emerald-200 rounded-xl px-4 py-3 text-neutral-900 focus:outline-none focus:border-emerald-500 transition-all uppercase placeholder:text-neutral-400 font-medium"
                placeholder="e.g. ROOM123"
                maxLength={8}
                required
              />
            </div>
            
            {error && (
              <div className="flex items-center text-rose-600 text-sm bg-rose-50 p-3 rounded-lg border border-rose-200">
                <AlertCircle className="w-4 h-4 mr-2 flex-shrink-0" />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={!isConnected}
              className="w-full bg-gradient-to-b from-emerald-400 to-emerald-600 hover:from-emerald-500 hover:to-emerald-700 text-white font-bold py-4 px-4 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl active:scale-95"
            >
              {isConnected ? 'Join Table' : 'Connecting...'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return <GameBoard room={room} myId={socket.id} />;
}

function GameBoard({ room, myId }: { room: RoomState; myId: string }) {
  const me = room.players[myId];
  const opponentId = room.playerOrder.find(id => id !== myId);
  const opponent = opponentId ? room.players[opponentId] : null;

  const isActivePlayer = room.playerOrder[room.activePlayerIndex] === myId;
  const activePlayer = room.players[room.playerOrder[room.activePlayerIndex]];

  if (room.status === 'waiting') {
    return (
      <div className="min-h-screen bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-emerald-50 to-teal-100 text-neutral-800 flex flex-col items-center justify-center p-4">
        <div className="animate-pulse flex flex-col items-center">
          <Dices className="w-20 h-20 text-emerald-500 mb-6 drop-shadow-sm" />
          <h2 className="text-3xl font-bold mb-4 text-emerald-900">Waiting for opponent...</h2>
          <div className="bg-white/60 border border-emerald-200 px-6 py-3 rounded-2xl flex items-center shadow-sm">
            <span className="text-emerald-700 mr-3 font-medium uppercase tracking-wider text-sm">Room Code</span>
            <span className="font-mono text-2xl font-bold text-emerald-900 tracking-widest">{room.id}</span>
          </div>
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
          <span className="font-black text-xl tracking-tight text-transparent bg-clip-text bg-gradient-to-br from-emerald-600 to-teal-800">Yacht Dice</span>
        </div>
        <div className="flex items-center gap-6">
          <div className="text-emerald-800 font-bold bg-emerald-100 px-4 py-1.5 rounded-full border border-emerald-200">
            Round <span className="text-emerald-950 ml-1">{room.currentRound} / 12</span>
          </div>
          <div className="text-emerald-600 text-sm font-mono tracking-widest">
            {room.id}
          </div>
        </div>
      </header>

      {/* Main Game Area */}
      <main className="flex-1 flex flex-col lg:flex-row overflow-hidden relative">
        
        {/* Left/Top: Scorecard */}
        <div className="w-full lg:w-[400px] flex-shrink-0 bg-white/40 border-r border-emerald-100 overflow-y-auto custom-scrollbar">
          <Scorecard room={room} myId={myId} opponent={opponent} me={me} isActivePlayer={isActivePlayer} />
        </div>

        {/* Right/Bottom: Table & Dice */}
        <div className="flex-1 flex flex-col items-center justify-center relative p-4 lg:p-8">
          
          {/* Turn Indicator */}
          <motion.div 
            key={activePlayer.id}
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="absolute top-8 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur-md border border-emerald-200 px-8 py-3 rounded-full shadow-lg z-20 flex items-center"
          >
            <User className={cn("w-5 h-5 mr-3", isActivePlayer ? "text-emerald-500" : "text-rose-500")} />
            <span className="font-bold text-lg text-neutral-800">
              {isActivePlayer ? "Your Turn" : `${activePlayer.name}'s Turn`}
            </span>
          </motion.div>

          {/* Dice Area */}
          <div className="flex-1 w-full max-w-3xl flex flex-col items-center justify-center">
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
                        socket.emit('toggle_hold', { roomId: room.id, index: i });
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
                    onClick={() => socket.emit('roll_dice', room.id)}
                    disabled={activePlayer.rollsLeft === 0}
                    className={cn(
                      "w-full font-black py-4 px-8 rounded-2xl shadow-lg transition-all active:scale-95 flex items-center justify-center text-xl uppercase tracking-wider",
                      activePlayer.rollsLeft > 0
                        ? "bg-gradient-to-b from-emerald-400 to-emerald-600 hover:from-emerald-500 hover:to-emerald-700 text-white shadow-emerald-500/30"
                        : "bg-neutral-200 text-neutral-400 cursor-not-allowed border border-neutral-300"
                    )}
                  >
                    <Dices className="w-6 h-6 mr-3" />
                    {!activePlayer.hasRolled 
                      ? 'Roll Dice' 
                      : activePlayer.rollsLeft > 0 
                        ? `Reroll (${activePlayer.rollsLeft} left)` 
                        : 'Select Score'}
                  </button>
                  {activePlayer.hasRolled && activePlayer.rollsLeft > 0 && (
                    <p className="text-center text-emerald-700/80 text-sm font-medium">
                      Select a category on the left to score, or reroll.
                    </p>
                  )}
                </div>
              ) : (
                <div className="text-emerald-700/80 font-medium text-lg flex items-center">
                  <div className="w-2 h-2 bg-emerald-500 rounded-full animate-ping mr-3" />
                  Waiting for {activePlayer.name} to play...
                </div>
              )}
            </div>
          </div>
        </div>

      </main>

      {/* Game Over Overlay */}
      <AnimatePresence>
        {room.status === 'game_over' && (
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
              <Trophy className={cn(
                "w-24 h-24 mx-auto mb-6 drop-shadow-md",
                room.winner === myId ? "text-yellow-400" : room.winner === 'tie' ? "text-neutral-400" : "text-rose-400"
              )} />
              
              <h2 className="text-5xl font-black mb-3 text-transparent bg-clip-text bg-gradient-to-br from-emerald-600 to-teal-800">
                {room.winner === myId ? 'Victory!' : room.winner === 'tie' ? 'Draw!' : 'Defeat!'}
              </h2>
              
              <div className="flex justify-center items-center gap-8 my-8">
                <div className="text-center">
                  <p className="text-neutral-500 text-sm font-bold uppercase tracking-wider mb-1">You</p>
                  <p className="text-4xl font-black text-emerald-500">{getTotalScore(me)}</p>
                </div>
                <div className="w-px h-12 bg-neutral-200"></div>
                <div className="text-center">
                  <p className="text-neutral-500 text-sm font-bold uppercase tracking-wider mb-1">{opponent?.name}</p>
                  <p className="text-4xl font-black text-rose-500">{opponent ? getTotalScore(opponent) : 0}</p>
                </div>
              </div>

              <button
                onClick={() => socket.emit('play_again', room.id)}
                className={cn(
                  "w-full font-black py-5 px-8 rounded-2xl transition-all text-xl uppercase tracking-wider shadow-lg",
                  me.ready 
                    ? "bg-neutral-200 text-neutral-400 cursor-not-allowed border border-neutral-300"
                    : "bg-gradient-to-b from-emerald-400 to-emerald-600 hover:from-emerald-500 hover:to-emerald-700 text-white shadow-emerald-500/30 active:scale-95"
                )}
                disabled={me.ready}
              >
                {me.ready ? 'Waiting...' : 'Play Again'}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Scorecard({ room, myId, opponent, me, isActivePlayer }: { room: RoomState, myId: string, opponent: PlayerState | null, me: PlayerState, isActivePlayer: boolean }) {
  
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
            canScore ? "cursor-pointer hover:bg-emerald-100" : ""
          )}
          onClick={() => {
            if (canScore) {
              socket.emit('score_category', { roomId: room.id, category: cat.id });
            }
          }}
        >
          {myScore !== undefined ? (
            <span className="font-black text-lg text-emerald-600">{myScore}</span>
          ) : canScore ? (
            <span className="font-bold text-lg text-emerald-400 group-hover:text-emerald-600 transition-colors">{potentialScore}</span>
          ) : (
            <span className="text-neutral-300">-</span>
          )}
        </div>

        {/* Opponent Score Column */}
        <div className="border-l border-emerald-100 flex items-center justify-center bg-neutral-50/50">
          {oppScore !== undefined ? (
            <span className="font-black text-lg text-rose-500">{oppScore}</span>
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
          <div className="py-4 px-4 font-black text-emerald-800 uppercase tracking-widest text-sm">Category</div>
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
              <span className="font-bold text-emerald-800 text-sm">Bonus (&gt;=63)</span>
              <span className="text-[10px] text-emerald-600 uppercase tracking-wider">+35 Points</span>
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
          <div className="py-5 px-4 font-black text-emerald-900 uppercase tracking-widest text-lg">Total</div>
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
          <Check className="w-3 h-3 mr-1" /> KEEP
        </div>
      )}
    </motion.div>
  );
}
