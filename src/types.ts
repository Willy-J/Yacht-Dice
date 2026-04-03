export type DiceFace = 1 | 2 | 3 | 4 | 5 | 6;

export type ScoreCategory = 
  | 'ones' | 'twos' | 'threes' | 'fours' | 'fives' | 'sixes'
  | 'choice' | 'fourOfAKind' | 'fullHouse' | 'smallStraight' | 'largeStraight' | 'yacht';

export interface PlayerState {
  id: string;
  name: string;
  dice: DiceFace[];
  held: boolean[];
  rollsLeft: number;
  scores: Partial<Record<ScoreCategory, number>>;
  ready: boolean;
  hasRolled: boolean;
}

export interface RoomState {
  id: string;
  players: Record<string, PlayerState>;
  playerOrder: string[];
  status: 'waiting' | 'playing' | 'game_over';
  currentRound: number;
  activePlayerIndex: number;
  winner?: string;
}

export const CATEGORIES: { id: ScoreCategory; name: string; description: string }[] = [
  { id: 'ones', name: '1点 (Aces)', description: '所有1的总和' },
  { id: 'twos', name: '2点 (Deuces)', description: '所有2的总和' },
  { id: 'threes', name: '3点 (Threes)', description: '所有3的总和' },
  { id: 'fours', name: '4点 (Fours)', description: '所有4的总和' },
  { id: 'fives', name: '5点 (Fives)', description: '所有5的总和' },
  { id: 'sixes', name: '6点 (Sixes)', description: '所有6的总和' },
  { id: 'choice', name: '全选 (Choice)', description: '所有骰子的总和' },
  { id: 'fourOfAKind', name: '四条 (4 of a Kind)', description: '至少4个相同，记所有骰子总和' },
  { id: 'fullHouse', name: '葫芦 (Full House)', description: '3个相同+2个相同，记25分' },
  { id: 'smallStraight', name: '小顺 (S. Straight)', description: '4个连续数字，记30分' },
  { id: 'largeStraight', name: '大顺 (L. Straight)', description: '5个连续数字，记40分' },
  { id: 'yacht', name: '快艇 (Yacht)', description: '5个相同数字，记50分' },
];
