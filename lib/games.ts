export type GameType = {
  id: string;
  name: string;
  emoji: string;
};

export const GAME_TYPES: GameType[] = [
  { id: 'fifa', emoji: '⚽', name: 'FIFA / EA FC' },
  { id: 'nba2k', emoji: '🏀', name: 'NBA 2K' },
  { id: 'madden', emoji: '🏈', name: 'Madden NFL' },
  { id: 'efootball', emoji: '🎮', name: 'PES / eFootball' },
  { id: 'f1', emoji: '🏎️', name: 'F1' },
  { id: 'callofduty', emoji: '🔫', name: 'Call of Duty' },
  { id: 'fortnite', emoji: '🎯', name: 'Fortnite' },
  { id: 'chess', emoji: '♟️', name: 'Chess' },
  { id: 'billiards', emoji: '🎱', name: 'Billiards' },
  { id: 'tabletennis', emoji: '🏓', name: 'Table Tennis' },
  { id: 'backgammon', emoji: '🎲', name: 'Backgammon / Tavla' },
  { id: 'cards', emoji: '🃏', name: 'Card Games' },
  { id: 'bowling', emoji: '🎳', name: 'Bowling' },
  { id: 'other', emoji: '⚾', name: 'Other' },
];

export const getGameEmoji = (gameId: string): string => {
  const game = GAME_TYPES.find((g) => g.id === gameId);
  return game?.emoji ?? '🎮';
};

export const getGameName = (gameId: string): string => {
  const game = GAME_TYPES.find((g) => g.id === gameId);
  return game?.name ?? gameId;
};
