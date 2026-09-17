import { createMockWallet } from './wallet-mock.mjs';
import { createOperatorHttpWallet } from './operator-http.mjs';
import { OPERATOR_WALLET_BASE_URL, WALLET_MOCK } from '../config.mjs';

export function createWalletForOperator(operator) {
  const mode = operator?.wallet?.mode || (WALLET_MOCK ? 'mock' : 'http');
  if (mode === 'mock') return createMockWallet();
  const walletConfig = { ...operator.wallet };
  if (OPERATOR_WALLET_BASE_URL) walletConfig.baseUrl = OPERATOR_WALLET_BASE_URL;
  return createOperatorHttpWallet(walletConfig);
}
