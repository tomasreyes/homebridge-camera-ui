'use-strict';

const logger = require('../services/logger/logger.service');

const NotificationsModel = require('./components/notifications/notifications.model');
const Streams = require('./services/streams.service');

const closeTimeout = {};

class SocketIO {
  constructor(server) {
    this.closeTimeout = null;
    this.rooms = [];

    this.io = require('socket.io')(server, {
      cors: {
        origin: '*',
      },
    });

    this.io.on('connection', async (socket) => {
      logger.debug(`${socket.conn.remoteAddress} connected to server`, false, '[Socket]');

      const notifications = (await NotificationsModel.list({})) || [];
      socket.emit('notification_size', notifications.length);

      socket.on('join_stream', (data) => {
        if (data.feed) {
          logger.debug(
            `New WebSocket connection from ${socket.conn.remoteAddress} to room: stream/${data.feed}`,
            false,
            '[Socket]'
          );
          socket.join(`stream/${data.feed}`);
          this.handleStream(data.feed);
        }
      });

      socket.on('leave_stream', (data) => {
        if (data.feed) {
          logger.debug(
            `${socket.conn.remoteAddress} disconnected or closed from room: stream/${data.feed}`,
            false,
            '[Socket]'
          );
          socket.leave(`stream/${data.feed}`);
          this.rooms = this.rooms.filter((room) => room !== data.feed);
          this.handleStream(data.feed);
        }
      });

      socket.on('disconnect', () => {
        logger.debug(`${socket.conn.remoteAddress} disconnected from server`, false, '[Socket]');
        for (const cameraName of this.rooms) {
          this.handleStream(cameraName);
        }
      });
    });
  }

  handleStream(cameraName) {
    const clients = this.io.sockets.adapter.rooms.get(`stream/${cameraName}`)?.size || 0;
    logger.debug(`Active sockets in room (stream/${cameraName}): ${clients}`, false, '[Socket]');

    if (closeTimeout[cameraName]) {
      clearTimeout(closeTimeout[cameraName]);
      closeTimeout[cameraName] = null;
    }

    if (clients) {
      Streams.startStream(cameraName);
      if (!this.rooms.includes(cameraName)) this.rooms.push(cameraName);
    } else {
      logger.debug('If no clients connects to the Websocket, the stream will be closed in 15s', cameraName, '[Socket]');
      closeTimeout[cameraName] = setTimeout(() => Streams.stopStream(cameraName), 15000);
      this.rooms = this.rooms.filter((room) => room !== cameraName);
    }
  }
}

module.exports = SocketIO;
