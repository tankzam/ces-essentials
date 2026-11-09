/** Company plans bill a minimum of 10 people. */
export const MIN_SEATS = 10;

export const billedSeats = (activePeople: number) => Math.max(MIN_SEATS, activePeople);
