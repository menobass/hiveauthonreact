import AsyncStorage from '@react-native-async-storage/async-storage';
import * as CryptoJS from 'crypto-js';

// HiveAuth WebSocket configuration
// Default HAS server (can be overridden)
const DEFAULT_HAS_URL = 'wss://hive-auth.arcange.eu/';
const TOKEN_STORAGE_KEY = 'hiveauth_token';
const USER_STORAGE_KEY = 'hiveauth_user';
const PENDING_AUTH_KEY = 'hiveauth_pending_auth';

export interface HiveAuthLoginRequest {
  uuid: string;
  user: string;
  key: string;
}

export interface HiveAuthResponse {
  uuid: string;
  key: string;
  status: 'pending' | 'approved' | 'rejected';
  token?: string;
  expire?: number;
}

export interface HiveAuthCallbackData {
  uuid: string;
  status: 'ok' | 'error';
  token?: string;
  error?: string;
}

export class HiveAuthService {
  // --- Internal WebSocket state ---
  private ws: WebSocket | null = null;
  private connected = false;
  private hasTimeoutMs = 60_000; // default, updated from server
  private reconnecting = false;
  private serverUrl: string = DEFAULT_HAS_URL;

  // Active session after auth
  private session: null | { username: string; authKey: string; expire?: number; token?: string } = null;

  // --- Pending auth state ---
  private pendingAuth:
    | null
    | {
        username: string;
        authKey: string;
        uuid?: string;
        host?: string;
        resolve: (res: HiveAuthResponse) => void;
        reject: (err: Error) => void;
  onWait?: (evt: { uuid: string; expire?: number; key: string; host: string }) => void;
        expireAt?: number;
  timeoutId?: any;
      } = null;

  // --- Pending sign state ---
  private pendingSign:
    | null
    | {
        resolve: (res: { uuid: string; status: 'approved' | 'rejected' }) => void;
        reject: (err: Error) => void;
        uuid?: string;
        onWait?: (evt: { uuid: string }) => void;
      } = null;

  // Minimal app meta (as in HTML demo)
  private APP_META = {
    name: 'has-demo-client-rn',
    description: 'Demo - HiveAuth from React Native',
    // icon: 'https://domain.com/logo.png',
  };

  // Generate a UUID v4 with fallback if expo-crypto is unavailable
  private safeUUID(): string {
    // JS-only v4 UUID (not cryptographically secure, but sufficient to identify the request locally)
    const tpl = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx';
    return tpl.replace(/[xy]/g, c => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  // Generate URL-safe random string of given length (default 32)
  private generateAuthKey(len = 32): string {
    this.ensureRandomPolyfill();
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const buf = new Uint8Array(len);
    (globalThis.crypto as any).getRandomValues(buf);
    let out = '';
    for (let i = 0; i < len; i++) out += chars[buf[i] % chars.length];
    return out;
  }

  // Connect (or reuse) WebSocket
  private async ensureWs(): Promise<void> {
    if (this.ws && this.connected) return;
    await new Promise<void>((resolve, reject) => {
      try {
  this.ws = new WebSocket(this.serverUrl);
      } catch (e: any) {
        return reject(e);
      }

      // onopen
      this.ws!.onopen = () => {
        this.connected = true;
        resolve();
      };

      // onmessage
      this.ws!.onmessage = (event: any) => {
        try {
          const message = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
          this.handleHasMessage(message);
        } catch (e) {
          // ignore bad frames
        }
      };

      // onclose
      this.ws!.onclose = () => {
        this.connected = false;
        this.ws = null;
        // Do not reject pending auth on background/app switch; we'll try to reattach on resume
      };

      // onerror
  this.ws!.onerror = (err: any) => {
        // Surface error if we were waiting to connect
        if (!this.connected && this.pendingAuth) {
          this.pendingAuth.reject(new Error(err?.message || 'WebSocket error'));
          this.pendingAuth = null;
        }
      };
    });
  }

  private extractWsHost(): string {
    try {
      const url = new URL(this.serverUrl);
      return url.host; // host:port
    } catch {
      return this.serverUrl.replace(/^wss?:\/\//, '').replace(/\/$/, '');
    }
  }

  setServer(url: string) {
    // basic validation
    if (!/^wss?:\/\//i.test(url)) throw new Error('Invalid HAS server URL');
    this.serverUrl = url.endsWith('/') ? url : url + '/';
    // Reset WS so next ensureWs connects to the new server
    try { this.ws?.close(); } catch {}
    this.ws = null;
    this.connected = false;
  }

  getServer(): string {
    return this.serverUrl;
  }

  // Ensure globalThis.crypto.getRandomValues exists and does not throw
  private ensureRandomPolyfill() {
    try {
      const g: any = globalThis as any;
      if (!g.crypto) g.crypto = {};
      const c = g.crypto;
      let works = false;
      if (typeof c.getRandomValues === 'function') {
        try {
          c.getRandomValues(new Uint8Array(1));
          works = true;
        } catch {}
      }
      if (!works) {
        c.getRandomValues = (arr: Uint8Array) => {
          for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256);
          return arr;
        };
      }
    } catch {
      // ignore
    }
  }

  /**
   * Returns whether an authentication is currently pending.
   */
  isPending(): boolean {
    return !!this.pendingAuth;
  }

  /**
   * Cancel any pending authentication and clear saved state.
   */
  async cancelPending(): Promise<void> {
    try {
      if (this.pendingAuth) {
        if (this.pendingAuth.timeoutId) clearTimeout(this.pendingAuth.timeoutId);
        try {
          this.pendingAuth.reject(new Error('Authentication cancelled'));
        } catch {}
      }
      this.pendingAuth = null;
      await this.clearPendingAuth();
    } catch {}
  }

  // Handle messages coming from HAS
  private handleHasMessage(message: any) {
    const cmd = message?.cmd;
    if (!cmd) return;

    // Server handshake: update timeout/protocol if present
    if (cmd === 'connected') {
      if (typeof message.timeout === 'number') this.hasTimeoutMs = message.timeout * 1000;
      // If we have a pending auth with a uuid, try to re-attach automatically after reconnect
      if (this.pendingAuth?.uuid && this.ws) {
        try {
          this.ws.send(JSON.stringify({ cmd: 'auth_attach', uuid: this.pendingAuth.uuid }));
        } catch {}
      }
      return;
    }

  if (!this.pendingAuth) return;

    switch (cmd) {
      case 'auth_wait': {
        // Pending approval; keep uuid/expire
        this.pendingAuth.uuid = message.uuid;
        this.pendingAuth.expireAt = message.expire ? Number(message.expire) : undefined;
        const fullHost = this.serverUrl.replace(/\/$/, '');
        this.pendingAuth.host = fullHost;
        // Persist pending auth so we can resume after app returns from Keychain
        this.savePendingAuth({
          uuid: message.uuid,
          username: this.pendingAuth.username,
          key: this.pendingAuth.authKey,
          host: fullHost,
          expireAt: this.pendingAuth.expireAt,
        }).catch(() => {});
        this.pendingAuth.onWait?.({ uuid: message.uuid, expire: message.expire, key: this.pendingAuth.authKey, host: fullHost });
        break;
      }
      case 'auth_ack': {
        // Approved; decrypt payload
        try {
          const decrypted = CryptoJS.AES.decrypt(message.data, this.pendingAuth.authKey).toString(
            CryptoJS.enc.Utf8
          );
          const data = JSON.parse(decrypted || '{}');
          const result: HiveAuthResponse = {
            uuid: this.pendingAuth.uuid || message.uuid,
            key: this.pendingAuth.authKey,
            status: 'approved',
            token: data?.token, // DEPRECATED but still sent sometimes
            expire: data?.expire,
          };
          // Persist token if present
          if (result.token) {
            this.storeToken(result.token, this.pendingAuth.username).catch(() => {});
          }
          // Keep session in memory for subsequent sign requests
          this.session = {
            username: this.pendingAuth.username,
            authKey: this.pendingAuth.authKey,
            expire: result.expire,
            token: result.token,
          };
          if (this.pendingAuth.timeoutId) clearTimeout(this.pendingAuth.timeoutId);
          this.pendingAuth.resolve(result);
        } catch (e: any) {
          if (this.pendingAuth?.timeoutId) clearTimeout(this.pendingAuth.timeoutId);
          this.pendingAuth.reject(new Error('Failed to decrypt auth_ack'));
        } finally {
          this.pendingAuth = null;
          // Clear persisted pending auth
          this.clearPendingAuth().catch(() => {});
        }
        break;
      }
      case 'auth_nack': {
        if (this.pendingAuth.timeoutId) clearTimeout(this.pendingAuth.timeoutId);
        this.pendingAuth.reject(new Error('Authentication rejected'));
        this.pendingAuth = null;
        this.clearPendingAuth().catch(() => {});
        break;
      }
      case 'auth_err': {
        // error is AES encrypted
        try {
          const errText = CryptoJS.AES.decrypt(message.error, this.pendingAuth.authKey).toString(
            CryptoJS.enc.Utf8
          );
          if (this.pendingAuth.timeoutId) clearTimeout(this.pendingAuth.timeoutId);
          this.pendingAuth.reject(new Error(errText || 'Authentication error'));
        } catch {
          if (this.pendingAuth?.timeoutId) clearTimeout(this.pendingAuth.timeoutId);
          this.pendingAuth.reject(new Error('Authentication error'));
        }
        this.pendingAuth = null;
        this.clearPendingAuth().catch(() => {});
        break;
      }
      case 'sign_wait': {
        if (this.pendingSign) {
          this.pendingSign.uuid = message.uuid;
          this.pendingSign.onWait?.({ uuid: message.uuid });
        }
        break;
      }
      case 'sign_ack': {
        if (this.pendingSign) {
          this.pendingSign.resolve({ uuid: this.pendingSign.uuid || message.uuid, status: 'approved' });
          this.pendingSign = null;
        }
        break;
      }
      case 'sign_nack': {
        if (this.pendingSign) {
          this.pendingSign.reject(new Error('Signature rejected'));
          this.pendingSign = null;
        }
        break;
      }
      case 'sign_err': {
        if (this.pendingSign) {
          try {
            const errText = CryptoJS.AES.decrypt(message.error, this.session?.authKey || '').toString(CryptoJS.enc.Utf8);
            this.pendingSign.reject(new Error(errText || 'Signature error'));
          } catch {
            this.pendingSign.reject(new Error('Signature error'));
          }
          this.pendingSign = null;
        }
        break;
      }
    }
  }

  /**
   * Start an authentication with HAS.
   * Returns when approved/rejected. Calls onWait when the request is pending and returns uuid/expire.
   */
  async authenticate(
    username: string,
    onWait?: (evt: { uuid: string; expire?: number; key?: string; host?: string }) => void
  ): Promise<HiveAuthResponse> {
    if (!username || typeof username !== 'string') throw new Error('Invalid username');
    if (this.pendingAuth) throw new Error('Another authentication is in progress');

    await this.ensureWs();

  // Use UUID v4 for auth_key like the official HTML demo
  const authKey = this.safeUUID();
    const payload = {
      app: this.APP_META,
      // challenge: optional, omitted for now
      // token: deprecated
    } as const;

  // Make sure random salt generation doesn't crash
  this.ensureRandomPolyfill();
  const data = CryptoJS.AES.encrypt(JSON.stringify(payload), authKey).toString();
    const frame = { cmd: 'auth_req', account: username, data };

    const res = await new Promise<HiveAuthResponse>((resolve, reject) => {
      this.pendingAuth = { username, authKey, resolve, reject, onWait };
      try {
        this.ws?.send(JSON.stringify(frame));
      } catch (e: any) {
        this.pendingAuth = null;
        reject(new Error(e?.message || 'Failed to send auth_req'));
      }
      // Safety timeout if server never replies
      const timeout = setTimeout(() => {
        if (this.pendingAuth) {
          this.pendingAuth.reject(new Error('Authentication timed out'));
          this.pendingAuth = null;
          this.clearPendingAuth().catch(() => {});
        }
      }, this.hasTimeoutMs + 5_000);
      if (this.pendingAuth) this.pendingAuth.timeoutId = timeout;
    });

    return res;
  }

  /**
   * Request signing a custom_json with posting key.
   */
  async signCustomJson(messageText: string, id = 'react_native_demo', broadcast = true, onWait?: (evt: { uuid: string }) => void): Promise<{ uuid: string; status: 'approved' | 'rejected' }> {
    if (!this.session) throw new Error('Not authenticated');
    await this.ensureWs();

    const op: any = [
      'custom_json',
      {
        id,
        json: JSON.stringify({ message: messageText, ts: Date.now() }),
        required_auths: [],
        required_posting_auths: [this.session.username],
      },
    ];
    const sign_data = {
      key_type: 'posting',
      ops: [op],
      broadcast,
      nonce: Date.now(),
    };
    const data = CryptoJS.AES.encrypt(JSON.stringify(sign_data), this.session.authKey).toString();
    const frame: any = { cmd: 'sign_req', account: this.session.username, data };
    if (this.session.token) frame.token = this.session.token; // deprecated but harmless

    return await new Promise((resolve, reject) => {
      this.pendingSign = { resolve, reject, onWait };
      try {
        this.ws?.send(JSON.stringify(frame));
      } catch (e: any) {
        this.pendingSign = null;
        reject(new Error(e?.message || 'Failed to send sign_req'));
      }
    });
  }

  /**
   * Attempt to resume a pending authentication by re-attaching after app resumes.
   * If a pending auth exists in memory or storage, reconnect WS and send attach frame.
   */
  async resumePendingAuth(onWait?: (evt: { uuid: string; expire?: number; key?: string; host?: string }) => void): Promise<boolean> {
    try {
      // If we already have a pending auth in memory but missing onWait, allow caller to set it
      if (this.pendingAuth && onWait) this.pendingAuth.onWait = onWait;

      // Load from storage if nothing in memory
      if (!this.pendingAuth) {
        const saved = await this.loadPendingAuth();
        if (saved) {
          // Clear expired pending auth
          if (saved.expireAt && Date.now() > Number(saved.expireAt)) {
            await this.clearPendingAuth();
            return false;
          }
          await new Promise<void>((resolve, reject) => {
            // create a placeholder pending promise that resolves when ack/nack arrives
            // If someone calls authenticate() again, this will be replaced.
            const resolveFn = (_: HiveAuthResponse) => resolve();
            const rejectFn = (_: Error) => resolve();
            this.pendingAuth = {
              username: saved.username,
              authKey: saved.key,
              uuid: saved.uuid,
              host: saved.host,
              resolve: resolveFn,
              reject: rejectFn,
              onWait,
              expireAt: saved.expireAt,
            };
          });
        }
      }

      if (!this.pendingAuth || !this.pendingAuth.uuid) return false;

      await this.ensureWs();
      // Send attach frame. Protocol naming may vary across HAS versions; try common variants.
      const attachFrames = [
        { cmd: 'auth_attach', uuid: this.pendingAuth.uuid },
        { cmd: 'attach', uuid: this.pendingAuth.uuid },
        // Some implementations accept a status request
        { cmd: 'auth_status', uuid: this.pendingAuth.uuid },
      ];
      for (const frame of attachFrames) {
        try {
          this.ws?.send(JSON.stringify(frame));
        } catch {}
      }

      // Re-emit onWait so UI can show details again
      const host = this.pendingAuth.host || this.extractWsHost();
      this.pendingAuth.onWait?.({ uuid: this.pendingAuth.uuid, expire: this.pendingAuth.expireAt, key: this.pendingAuth.authKey, host });
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Simple base64 encoding for React Native
   */
  private base64Encode(str: string): string {
    // For React Native, use a simple base64 implementation
    // This is a basic implementation - in production you might want a more robust library
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let result = '';
    let i = 0;
    
    while (i < str.length) {
      const a = str.charCodeAt(i++);
      const b = i < str.length ? str.charCodeAt(i++) : 0;
      const c = i < str.length ? str.charCodeAt(i++) : 0;
      
      const combined = (a << 16) | (b << 8) | c;
      
      result += chars.charAt((combined >> 18) & 63);
      result += chars.charAt((combined >> 12) & 63);
      result += i - 2 < str.length ? chars.charAt((combined >> 6) & 63) : '=';
      result += i - 1 < str.length ? chars.charAt(combined & 63) : '=';
    }
    
    return result;
  }

  // URL-safe base64 (RFC 4648) without padding
  private base64UrlEncode(str: string): string {
    const b64 = this.base64Encode(str);
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  /**
   * Build the deep link URL for Hive Keychain Mobile
   * This creates a QR code compatible URI that Keychain can scan
   */
  buildKeychainDeepLink(uuid: string, username: string, authKey: string, host?: string): string {
    // Create the HAS URI format as used in the HTML example
    const hasData = {
      account: username,
      uuid: uuid,
      key: authKey,
      // Pass the full wss URL as in the official sample
      host: (host || this.serverUrl).replace(/\/$/, '')
    };
    
    console.log('Building Keychain deep link with data:', hasData);
    
  // Use standard base64 (btoa equivalent) like the official demo
  const encodedData = this.base64Encode(JSON.stringify(hasData));
    const deepLink = `has://auth_req/${encodedData}`;
    
    console.log('Generated deep link:', deepLink);
    
    return deepLink;
  }

  /**
   * Parse callback URL from Hive Keychain
   */
  parseCallbackUrl(url: string): HiveAuthCallbackData | null {
    try {
      const urlObj = new URL(url);
      const params = new URLSearchParams(urlObj.search);
      
      const uuid = params.get('uuid');
      const status = params.get('status') as 'ok' | 'error';
      const token = params.get('token');
      const error = params.get('error');

      if (!uuid || !status) {
        return null;
      }

      return {
        uuid,
        status,
        token: token || undefined,
        error: error || undefined,
      };
    } catch (error) {
      console.error('Error parsing callback URL:', error);
      return null;
    }
  }

  /**
   * Store authentication token locally
   */
  async storeToken(token: string, username: string): Promise<void> {
    try {
      await AsyncStorage.setItem(TOKEN_STORAGE_KEY, token);
      await AsyncStorage.setItem(USER_STORAGE_KEY, username);
    } catch (error) {
      console.error('Error storing token:', error);
      throw error;
    }
  }

  // --- Pending auth persistence helpers ---
  private async savePendingAuth(data: { uuid: string; username: string; key: string; host?: string; expireAt?: number }): Promise<void> {
    try {
      await AsyncStorage.setItem(PENDING_AUTH_KEY, JSON.stringify(data));
    } catch {}
  }
  private async loadPendingAuth(): Promise<null | { uuid: string; username: string; key: string; host?: string; expireAt?: number }> {
    try {
      const raw = await AsyncStorage.getItem(PENDING_AUTH_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  private async clearPendingAuth(): Promise<void> {
    try {
      await AsyncStorage.removeItem(PENDING_AUTH_KEY);
    } catch {}
  }

  /**
   * Retrieve stored authentication token
   */
  async getStoredToken(): Promise<{ token: string; username: string } | null> {
    try {
      const token = await AsyncStorage.getItem(TOKEN_STORAGE_KEY);
      const username = await AsyncStorage.getItem(USER_STORAGE_KEY);
      
      if (token && username) {
        return { token, username };
      }
      
      return null;
    } catch (error) {
      console.error('Error retrieving token:', error);
      return null;
    }
  }

  /**
   * Clear stored authentication data
   */
  async clearStoredAuth(): Promise<void> {
    try {
      await AsyncStorage.removeItem(TOKEN_STORAGE_KEY);
      await AsyncStorage.removeItem(USER_STORAGE_KEY);
    } catch (error) {
      console.error('Error clearing stored auth:', error);
      throw error;
    }
  }

  /**
   * Check if user is authenticated
   */
  async isAuthenticated(): Promise<boolean> {
    const stored = await this.getStoredToken();
    return stored !== null;
  }
}

export const hiveAuthService = new HiveAuthService();
