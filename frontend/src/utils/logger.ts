// Centralized logging utility
class Logger {
  private isDevelopment = process.env.NODE_ENV === 'development';
  private isProduction = process.env.NODE_ENV === 'production';

  // Network request logs
  logRequest(message: string, ...args: any[]) {
    if (this.isDevelopment) {
      console.log(`[REQUEST] ${message}`, ...args);
    }
  }

  // Network response logs
  logResponse(message: string, ...args: any[]) {
    if (this.isDevelopment) {
      console.log(`[RESPONSE] ${message}`, ...args);
    }
  }

  // Error logs
  logError(message: string, ...args: any[]) {
    if (this.isDevelopment) {
      console.error(`[ERROR] ${message}`, ...args);
    }
  }

  // Warning logs
  logWarn(message: string, ...args: any[]) {
    if (this.isDevelopment) {
      console.warn(`[WARN] ${message}`, ...args);
    }
  }

  // Info logs
  logInfo(message: string, ...args: any[]) {
    if (this.isDevelopment) {
      console.info(`[INFO] ${message}`, ...args);
    }
  }

  // Debug logs
  logDebug(message: string, ...args: any[]) {
    if (this.isDevelopment) {
      console.debug(`[DEBUG] ${message}`, ...args);
    }
  }

  // Critical errors in production (always logged)
  logCriticalError(message: string, ...args: any[]) {
    if (this.isProduction) {
      console.error(`[CRITICAL] ${message}`, ...args);
    } else {
      console.error(`[ERROR] ${message}`, ...args);
    }
  }

  // Network request logs
  logNetworkRequest(url: string, method: string, hasToken: boolean) {
    if (this.isDevelopment) {
      const tokenStatus = hasToken ? 'with token' : 'without token';
      console.log(`[NETWORK] ${method} ${url} - ${tokenStatus}`);
    }
  }

  // Network error logs
  logNetworkError(status: number, url: string, data?: any) {
    if (this.isDevelopment) {
      console.error(`[NETWORK ERROR] ${status} ${url}`, data);
    }
  }

  // Auth logs
  logAuth(message: string, ...args: any[]) {
    if (this.isDevelopment) {
      console.log(`[AUTH] ${message}`, ...args);
    }
  }

  // User info logs
  logUserInfo(message: string, ...args: any[]) {
    if (this.isDevelopment) {
      console.log(`[USER] ${message}`, ...args);
    }
  }

  // 2FA logs
  log2FA(message: string, ...args: any[]) {
    if (this.isDevelopment) {
      console.log(`[2FA] ${message}`, ...args);
    }
  }
}

// Singleton instance
export const logger = new Logger();

// Convenience exports
export const {
  logRequest,
  logResponse,
  logError,
  logWarn,
  logInfo,
  logDebug,
  logCriticalError,
  logNetworkRequest,
  logNetworkError,
  logAuth,
  logUserInfo,
  log2FA
} = logger;
