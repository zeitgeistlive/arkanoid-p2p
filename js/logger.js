/**
 * Arkanoid P2P - Logger Utility
 * Centralized logging system with severity levels
 * @module logger
 */

/**
 * Log severity levels
 * @readonly
 * @enum {string}
 */
const LogLevel = {
  DEBUG: 'debug',
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error'
};

/**
 * Logger configuration
 * @type {Object}
 */
const LoggerConfig = {
  /** @type {string} Minimum log level to output */
  minLevel: LogLevel.DEBUG,
  /** @type {boolean} Whether to include timestamps */
  timestamps: true,
  /** @type {boolean} Whether to include module prefixes */
  prefix: true,
  /** @type {boolean} Enable/disable all logging */
  enabled: true
};

/**
 * Log level priority mapping (lower = more verbose)
 * @type {Object.<string, number>}
 */
const LevelPriority = {
  [LogLevel.DEBUG]: 0,
  [LogLevel.INFO]: 1,
  [LogLevel.WARN]: 2,
  [LogLevel.ERROR]: 3
};

/**
 * Console method mapping for each log level
 * @type {Object.<string, Function>}
 */
const ConsoleMethods = {
  [LogLevel.DEBUG]: console.log.bind(console),
  [LogLevel.INFO]: console.log.bind(console),
  [LogLevel.WARN]: console.warn.bind(console),
  [LogLevel.ERROR]: console.error.bind(console)
};

/**
 * Logger class for structured logging
 */
class Logger {
  /**
   * Create a new Logger instance
   * @param {string} module - Module name for log prefixing
   */
  constructor(module) {
    /** @type {string} Module name */
    this.module = module;
  }

  /**
   * Check if a log level should be output
   * @private
   * @param {string} level - Log level to check
   * @returns {boolean}
   */
  _shouldLog(level) {
    if (!LoggerConfig.enabled) return false;
    return LevelPriority[level] >= LevelPriority[LoggerConfig.minLevel];
  }

  /**
   * Format log message with timestamp and prefix
   * @private
   * @param {string} level - Log level
   * @param {...*} args - Arguments to log
   * @returns {Array} Formatted arguments
   */
  _format(level, ...args) {
    const parts = [];
    
    if (LoggerConfig.timestamps) {
      parts.push(`[${new Date().toISOString().split('T')[1].slice(0, 12)}]`);
    }
    
    if (LoggerConfig.prefix) {
      parts.push(`[${this.module}]`);
    }
    
    if (parts.length > 0) {
      return [parts.join(' '), ...args];
    }
    return args;
  }

  /**
   * Log debug message
   * @param {...*} args - Messages to log
   */
  debug(...args) {
    if (this._shouldLog(LogLevel.DEBUG)) {
      ConsoleMethods[LogLevel.DEBUG](...this._format(LogLevel.DEBUG, ...args));
    }
  }

  /**
   * Log info message
   * @param {...*} args - Messages to log
   */
  info(...args) {
    if (this._shouldLog(LogLevel.INFO)) {
      ConsoleMethods[LogLevel.INFO](...this._format(LogLevel.INFO, ...args));
    }
  }

  /**
   * Log warning message
   * @param {...*} args - Messages to log
   */
  warn(...args) {
    if (this._shouldLog(LogLevel.WARN)) {
      ConsoleMethods[LogLevel.WARN](...this._format(LogLevel.WARN, ...args));
    }
  }

  /**
   * Log error message
   * @param {...*} args - Messages to log
   */
  error(...args) {
    if (this._shouldLog(LogLevel.ERROR)) {
      ConsoleMethods[LogLevel.ERROR](...this._format(LogLevel.ERROR, ...args));
    }
  }
}

/**
 * Create a new logger instance for a module
 * @param {string} module - Module name
 * @returns {Logger}
 */
function createLogger(module) {
  return new Logger(module);
}

/**
 * Set global log level
 * @param {string} level - New minimum log level
 */
function setLogLevel(level) {
  if (LevelPriority[level] !== undefined) {
    LoggerConfig.minLevel = level;
  }
}

/**
 * Enable or disable logging
 * @param {boolean} enabled - Whether logging should be enabled
 */
function setLoggingEnabled(enabled) {
  LoggerConfig.enabled = enabled;
}

// Export for both module and script tag usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { Logger, createLogger, setLogLevel, setLoggingEnabled, LogLevel };
}
