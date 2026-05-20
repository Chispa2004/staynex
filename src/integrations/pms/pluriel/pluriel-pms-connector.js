import { BasePmsConnector } from '../base-pms-connector.js';

export class PlurielPmsConnector extends BasePmsConnector {
  constructor(options = {}) {
    super({ ...options, provider: 'pluriel' });
  }
}
