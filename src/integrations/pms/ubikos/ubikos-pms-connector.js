import { BasePmsConnector } from '../base-pms-connector.js';

export class UbikosPmsConnector extends BasePmsConnector {
  constructor(options = {}) {
    super({ ...options, provider: 'ubikos' });
  }
}
