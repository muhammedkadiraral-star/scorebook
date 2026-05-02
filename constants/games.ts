export type GameConfig = {
  key: string;
  displayName: string;
  emoji: string;
  gameType: string;
};

export const GAMES: GameConfig[] = [
  { key: 'fifa', displayName: 'FIFA / EA FC', emoji: '⚽', gameType: 'fifa' },
  { key: 'nba', displayName: 'NBA 2K', emoji: '🏀', gameType: 'nba' },
  { key: 'madden', displayName: 'Madden NFL', emoji: '🏈', gameType: 'madden' },
  { key: 'pes', displayName: 'PES / eFootball', emoji: '🎮', gameType: 'pes' },
  { key: 'f1', displayName: 'F1 (Formula 1)', emoji: '🏎️', gameType: 'f1' },
  { key: 'cod', displayName: 'Call of Duty', emoji: '🔫', gameType: 'cod' },
  { key: 'fortnite', displayName: 'Fortnite', emoji: '🎯', gameType: 'fortnite' },
  { key: 'chess', displayName: 'Chess', emoji: '♟️', gameType: 'chess' },
  { key: 'billiards', displayName: 'Billiards', emoji: '🎱', gameType: 'billiards' },
  { key: 'table_tennis', displayName: 'Table Tennis', emoji: '🏓', gameType: 'table_tennis' },
  { key: 'backgammon', displayName: 'Backgammon (Tavla)', emoji: '🎲', gameType: 'backgammon' },
  { key: 'card_games', displayName: 'Card Games', emoji: '🃏', gameType: 'card_games' },
  { key: 'bowling', displayName: 'Bowling', emoji: '🎳', gameType: 'bowling' },
  { key: 'other', displayName: 'Other', emoji: '⚾', gameType: 'other' },
];

export const getGameDisplayName = (type: string): string => {
  const game = GAMES.find((g) => g.gameType === type);
  return game ? game.displayName : 'Game';
};

export const getGameEmoji = (type: string): string => {
  const game = GAMES.find((g) => g.gameType === type);
  return game ? game.emoji : '🎮';
};
