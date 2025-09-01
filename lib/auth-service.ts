import * as SecureStore from 'expo-secure-store';

export interface HiveCredentials {
  username: string;
  privateKey: string;
  publicKey: string;
}

const CREDENTIALS_KEY = 'hive_credentials';

export class AuthService {
  /**
   * Save user credentials securely
   */
  async saveCredentials(credentials: HiveCredentials): Promise<void> {
    try {
      await SecureStore.setItemAsync(CREDENTIALS_KEY, JSON.stringify(credentials));
    } catch (error) {
      console.error('Error saving credentials:', error);
      throw error;
    }
  }

  /**
   * Retrieve stored credentials
   */
  async getCredentials(): Promise<HiveCredentials | null> {
    try {
      const credentialsString = await SecureStore.getItemAsync(CREDENTIALS_KEY);
      return credentialsString ? JSON.parse(credentialsString) : null;
    } catch (error) {
      console.error('Error retrieving credentials:', error);
      return null;
    }
  }

  /**
   * Clear stored credentials
   */
  async clearCredentials(): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(CREDENTIALS_KEY);
    } catch (error) {
      console.error('Error clearing credentials:', error);
      throw error;
    }
  }

  /**
   * Check if user is logged in
   */
  async isLoggedIn(): Promise<boolean> {
    const credentials = await this.getCredentials();
    return credentials !== null;
  }

  /**
   * Generate a new key pair (placeholder - implement proper key generation)
   */
  async generateKeyPair(): Promise<{ publicKey: string; privateKey: string }> {
    // TODO: Implement proper Hive key generation using crypto libraries
    // This is a placeholder implementation
    return {
      publicKey: 'STM_PLACEHOLDER_PUBLIC_KEY',
      privateKey: 'PLACEHOLDER_PRIVATE_KEY'
    };
  }
}

export const authService = new AuthService();
