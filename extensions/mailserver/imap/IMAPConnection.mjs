import EventEmitter from "events";
import IMAPState from "./IMAPState";

const EOL = "\r\n";

export default class IMAPConnection {
  constructor(socket) {
    this.name = socket.remoteAddress + ":" + socket.remotePort;
    this.socket = socket;
    this.state = IMAPState.NotAuthenticated;
    this.user = null;

    this.authenticate = this.authenticate.bind(this);
    this.sendError = this.sendError.bind(this);
    this.sendSuccess = this.sendSuccess.bind(this);
    this.sendWelcomeMessage = this.sendWelcomeMessage.bind(this);
  }

  authenticate(tag, user) {
    this.user = user;
    this.state = IMAPState.Authenticated;
    this.sendSuccess(tag, "Welcome " + user);
  }

  sendError(tag, message) {
    this.socket.write(tag + " NO " + message + EOL);
  }

  sendSuccess(tag, message) {
    this.socket.write(tag + " OK " + message + EOL);
  }

  sendWelcomeMessage() {
    this.socket.write("* OK [CAPABILITY IMAP4REV1] Welcome " + this.name + EOL);
  }
}
