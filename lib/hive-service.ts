import { Client, PublicKey, PrivateKey } from '@hiveio/dhive';

// Hive nodes for API calls
const HIVE_NODES = [
  'https://api.hive.blog',
  'https://api.hivekings.com',
  'https://anyx.io',
];

export class HiveService {
  private client: Client;

  constructor() {
    this.client = new Client(HIVE_NODES);
  }

  /**
   * Get account information from Hive blockchain
   */
  async getAccount(username: string) {
    try {
      const accounts = await this.client.database.getAccounts([username]);
      return accounts[0] || null;
    } catch (error) {
      console.error('Error fetching account:', error);
      throw error;
    }
  }

  /**
   * Get account balance
   */
  async getAccountBalance(username: string) {
    try {
      const account = await this.getAccount(username);
      if (!account) return null;
      
      return {
        hive: account.balance,
        hbd: account.hbd_balance,
        savingsHive: account.savings_balance,
        savingsHbd: account.savings_hbd_balance,
        vestingShares: account.vesting_shares,
      };
    } catch (error) {
      console.error('Error fetching balance:', error);
      throw error;
    }
  }

  /**
   * Verify if a public key belongs to an account
   */
  async verifyAccountKey(username: string, publicKey: string, role: 'posting' | 'active' | 'owner' = 'posting') {
    try {
      const account = await this.getAccount(username);
      if (!account) return false;

      const authorities = account[role].key_auths;
      return authorities.some(([key]: [string | PublicKey, number]) => {
        const keyString = typeof key === 'string' ? key : key.toString();
        return keyString === publicKey;
      });
    } catch (error) {
      console.error('Error verifying key:', error);
      return false;
    }
  }

  /**
   * Get dynamic global properties (useful for fee calculations)
   */
  async getDynamicGlobalProperties() {
    try {
      return await this.client.database.getDynamicGlobalProperties();
    } catch (error) {
      console.error('Error fetching global properties:', error);
      throw error;
    }
  }

  /**
   * Broadcast a signed transaction
   */
  async broadcastTransaction(signedTransaction: any) {
    try {
      return await this.client.broadcast.send(signedTransaction);
    } catch (error) {
      console.error('Error broadcasting transaction:', error);
      throw error;
    }
  }

  /**
   * Check if the client is connected to Hive network
   */
  async testConnection() {
    try {
      await this.getDynamicGlobalProperties();
      return true;
    } catch (error) {
      console.error('Connection test failed:', error);
      return false;
    }
  }
}

export const hiveService = new HiveService();
