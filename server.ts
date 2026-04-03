import express from 'express';
import { createServer as createViteServer } from 'vite';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import path from 'path';
import { RoomState, PlayerState, DiceFace, ScoreCategory } from './src/types';

const PORT = 3000;

const rooms: Record<string, RoomState> = {};

function createEmptyPlayer(id: string, name: string): PlayerState {
  return {
    id,
    name,
    dice: [1, 1, 1, 1, 1],
    held: [false, false, false, false, false],
    rollsLeft: 3,
    scores: {},
    ready: false,
    hasRolled: false,
  };
}

function rollRandomDice(): DiceFace {
  return (Math.floor(Math.random() * 6) + 1) as DiceFace;
}

function calculateScore(dice: DiceFace[], category: ScoreCategory): number {
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

function getTotalScore(player: PlayerState): number {
  let upperSum = 0;
  let lowerSum = 0;
  const upperCats: ScoreCategory[] = ['ones', 'twos', 'threes', 'fours', 'fives', 'sixes'];
  
  for (const [cat, score] of Object.entries(player.scores)) {
    if (upperCats.includes(cat as ScoreCategory)) {
      upperSum += score || 0;
    } else {
      lowerSum += score || 0;
    }
  }
  
  const bonus = upperSum >= 63 ? 35 : 0;
  return upperSum + bonus + lowerSum;
}

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: { origin: '*' }
  });

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  io.on('connection', (socket: Socket) => {
    console.log('User connected:', socket.id);

    socket.on('join_room', ({ roomId, playerName }) => {
      socket.join(roomId);
      
      if (!rooms[roomId]) {
        rooms[roomId] = {
          id: roomId,
          players: {},
          playerOrder: [],
          status: 'waiting',
          currentRound: 1,
          activePlayerIndex: 0,
        };
      }

      const room = rooms[roomId];
      
      if (room.playerOrder.length >= 2 && !room.players[socket.id]) {
        socket.emit('error', 'Room is full');
        return;
      }

      if (!room.players[socket.id]) {
        room.players[socket.id] = createEmptyPlayer(socket.id, playerName || `Player ${room.playerOrder.length + 1}`);
        room.playerOrder.push(socket.id);
      }

      if (room.playerOrder.length === 2 && room.status === 'waiting') {
        room.status = 'playing';
        startTurn(room);
      }

      io.to(roomId).emit('room_state', room);
    });

    socket.on('roll_dice', (roomId) => {
      const room = rooms[roomId];
      if (!room || room.status !== 'playing') return;
      
      const activePlayerId = room.playerOrder[room.activePlayerIndex];
      if (socket.id !== activePlayerId) return;

      const player = room.players[socket.id];
      if (player.rollsLeft <= 0) return;

      player.dice = player.dice.map((d, i) => player.held[i] ? d : rollRandomDice());
      player.rollsLeft--;
      player.hasRolled = true;

      io.to(roomId).emit('room_state', room);
    });

    socket.on('toggle_hold', ({ roomId, index }) => {
      const room = rooms[roomId];
      if (!room || room.status !== 'playing') return;
      
      const activePlayerId = room.playerOrder[room.activePlayerIndex];
      if (socket.id !== activePlayerId) return;

      const player = room.players[socket.id];
      if (!player.hasRolled || player.rollsLeft === 0) return;

      player.held[index] = !player.held[index];
      io.to(roomId).emit('room_state', room);
    });

    socket.on('score_category', ({ roomId, category }) => {
      const room = rooms[roomId];
      if (!room || room.status !== 'playing') return;
      
      const activePlayerId = room.playerOrder[room.activePlayerIndex];
      if (socket.id !== activePlayerId) return;

      const player = room.players[socket.id];
      if (!player.hasRolled || player.scores[category as ScoreCategory] !== undefined) return;

      // Calculate and save score
      const score = calculateScore(player.dice, category as ScoreCategory);
      player.scores[category as ScoreCategory] = score;

      // Next turn
      room.activePlayerIndex++;
      if (room.activePlayerIndex >= room.playerOrder.length) {
        room.activePlayerIndex = 0;
        room.currentRound++;
      }

      if (room.currentRound > 12) {
        room.status = 'game_over';
        const p1 = room.players[room.playerOrder[0]];
        const p2 = room.players[room.playerOrder[1]];
        const s1 = getTotalScore(p1);
        const s2 = getTotalScore(p2);
        if (s1 > s2) room.winner = p1.id;
        else if (s2 > s1) room.winner = p2.id;
        else room.winner = 'tie';
      } else {
        startTurn(room);
      }

      io.to(roomId).emit('room_state', room);
    });

    socket.on('play_again', (roomId) => {
      const room = rooms[roomId];
      if (!room || room.status !== 'game_over') return;
      
      const player = room.players[socket.id];
      if (player) {
        player.ready = true;
      }

      const allReady = room.playerOrder.every(id => room.players[id].ready);
      if (allReady) {
        room.currentRound = 1;
        room.activePlayerIndex = 0;
        room.winner = undefined;
        room.playerOrder.forEach(id => {
          room.players[id] = createEmptyPlayer(id, room.players[id].name);
        });
        room.status = 'playing';
        startTurn(room);
        io.to(roomId).emit('room_state', room);
      } else {
        io.to(roomId).emit('room_state', room);
      }
    });

    socket.on('disconnect', () => {
      console.log('User disconnected:', socket.id);
      for (const roomId in rooms) {
        const room = rooms[roomId];
        if (room.players[socket.id]) {
          delete room.players[socket.id];
          room.playerOrder = room.playerOrder.filter(id => id !== socket.id);
          if (room.playerOrder.length === 0) {
            delete rooms[roomId];
          } else {
            room.status = 'waiting';
            room.currentRound = 1;
            room.activePlayerIndex = 0;
            room.winner = undefined;
            const remainingPlayerId = room.playerOrder[0];
            room.players[remainingPlayerId] = createEmptyPlayer(remainingPlayerId, room.players[remainingPlayerId].name);
            io.to(roomId).emit('room_state', room);
          }
        }
      }
    });
  });

  function startTurn(room: RoomState) {
    const activePlayerId = room.playerOrder[room.activePlayerIndex];
    const player = room.players[activePlayerId];
    player.dice = [1, 1, 1, 1, 1];
    player.held = [false, false, false, false, false];
    player.rollsLeft = 3;
    player.hasRolled = false;
  }

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(process.cwd(), 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(process.cwd(), 'dist', 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
