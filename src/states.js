// @flow

import type {
  StateType,
} from './types';

const createState = (subject: *): StateType => {
  // $FlowFixMe
  return subject;
};

export const SERVER_IS_NOT_READY = createState('SERVER_IS_NOT_READY');
export const SERVER_IS_NOT_SHUTTING_DOWN = createState('SERVER_IS_NOT_SHUTTING_DOWN');
export const SERVER_IS_READY = createState('SERVER_IS_READY');
export const SERVER_IS_SHUTTING_DOWN = createState('SERVER_IS_SHUTTING_DOWN');
