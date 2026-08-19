export class RetryableEmailError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RetryableEmailError';
  }
}

export class PermanentEmailError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PermanentEmailError';
  }
}
