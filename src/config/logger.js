const winston = require('winston');
const newrelicFormatter = require('@newrelic/winston-enricher')(winston);

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.label({ label: 'alfinete-api' }),
    newrelicFormatter()
  ),
  transports: [
    new winston.transports.Console()
  ]
});

module.exports = logger;