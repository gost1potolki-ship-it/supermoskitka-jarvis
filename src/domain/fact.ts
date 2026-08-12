import type { Channel } from './channel.js';

/** Provenance of a recorded fact value. */
export interface FactSource {
  sourceMessageId: string;
  sourceChannel: Channel;
  sourceTimestamp: string;
}

/** One recorded value together with its source. */
export interface FactVersion<T> extends FactSource {
  value: T;
}

/**
 * A fact with an explicit current value and prior versions.
 * `history` holds previous values only (oldest → newest). Current is not duplicated there.
 * `lastSeenSource` tracks the most recent message that confirmed the current value
 * (including repeats that did not change the value).
 */
export interface Fact<T> {
  current: FactVersion<T>;
  history: readonly FactVersion<T>[];
  lastSeenSource: FactSource;
}

export function createFact<T>(value: T, source: FactSource): Fact<T> {
  return {
    current: { value, ...source },
    history: [],
    lastSeenSource: source,
  };
}

export function getFactValue<T>(fact: Fact<T> | undefined): T | undefined {
  return fact?.current.value;
}
