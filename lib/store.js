const globalForGame = globalThis;

if (!globalForGame.gameState) {
  globalForGame.gameState = {
    code: "1234",
    status: "LOBBY", // LOBBY | ACTIVE | LEADERBOARD | NO_WINNERS | ENDED
    questionNumber: 0,
    maxQuestions: 20,
    players: [], // { name, score, roundPoints, roundRank, solvedCurrent }
    question: null, // { image, answer, hintText, hintRevealed, revealedAnswer }
    submissions: [], // { id, playerName, guess, isCorrect, pointsAwarded, rank, time }
    firstCorrectWinner: null, // { playerName, guess, points, time } | null
    resultRevealed: false,
    lastWinner: null,
  };
}

export const gameState = globalForGame.gameState;