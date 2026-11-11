/** Company plans bill a minimum of 5 people. */
export const MIN_SEATS = 5;

export const billedSeats = (activePeople: number) => Math.max(MIN_SEATS, activePeople);
