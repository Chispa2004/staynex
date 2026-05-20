import { BasePmsConnector } from '../base-pms-connector.js';

export class MewsPmsConnector extends BasePmsConnector {
  constructor(options = {}) {
    super({ ...options, provider: 'mews' });
  }
}
