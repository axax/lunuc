import IMAPConnection from "./IMAPConnection";
import IMAPProcessor from "./IMAPProcessor";

import net from "net";
import tls from "tls";

export class IMAPServer {
  constructor(options) {
    this._handleCommand = this._handleCommand.bind(this);
    this._socketHandler = this._socketHandler.bind(this);

    this.options = options || {};

    if (options.secure) {
      this.server = tls.createServer(this.options.tls, this._socketHandler);
    } else {
      this.server = net.createServer(this._socketHandler);
    }
  }

  onAuth() {}
  onList() {}
  onCreate() {}
  onSubscribe(){}

  _handleCommand(connection, { command, tag, args }) {
    // Prevent any command befor login
    if (command !== "LOGIN" && !connection.user) {
      return connection.sendError(tag, "Unauthenticated");
    }

    // Handle login handshake command
    if (command === "LOGIN") {
      const username = args[0];
      const password = args[1];

      this.onAuth({ username, password, tag }, connection, (err, user) => {
        if (err) {
          connection.sendError(tag, err.message ? err.message : err);
        } else if (user) {
          connection.authenticate(tag, user);
        }
      });
    }

    // Handle capability negotiation
    else if (command === "CAPABILITY") {
      connection.socket.write(
        tag +
          " OK [CAPABILITY IMAP4rev1 LITERAL+ SASL-IR LOGIN-REFERRALS ID ENABLE IDLE STARTTLS LIST AUTH=PLAIN AUTH=LOGIN] IMAP/POP3 ready - ServerName\r\n"
      );
    }

    // Handle list
    else if (command === "LIST") {
      const folder = args[0];
      const flag = args[1];

      this.onList({ folder, flag }, connection, (err, items) => {
        if (err) {
          connection.sendError(tag, err.message ? err.message : err);
        } else if (items) {
          const lines = items.map((item) => {
            return '* LIST (\\HasNoChildren) "." "' + item.name.toUpperCase() + '"';
          });

          for (let line of lines) {
            connection.socket.write(line + "\r\n");
          }

          connection.socket.write(tag + " OK Success" + "\r\n");
        }
      });
    }

    // Handle mailbox selection
    else if (command === "SELECT") {
      const mailbox = args[0];
      connection.socket.write("* FLAGS (\\Answered \\Flagged \\Deleted \\Seen \\Draft)\r\n");
      connection.socket.write("* OK [PERMANENTFLAGS (\\Answered \\Flagged \\Deleted \\Seen \\Draft *)] Flags permitted.\r\n")
      connection.socket.write("* 3 EXISTS\r\n");
      connection.socket.write("* 0 RECENT\r\n");
      connection.socket.write("* OK [UNSEEN 2] First unseen.\r\n");
      connection.socket.write("* OK [UIDVALIDITY 1] UIDs valid.\r\n")
      connection.socket.write("* OK [UIDNEXT 54948] Predicted next UID.\r\n");
      connection.socket.write("* OK [NOMODSEQ] No permanent modsequences\r\n");
      connection.socket.write(tag + " OK [READ-WRITE] " + mailbox + " selected. (Success)\r\n");
    }

    // Handle mailbox creation
    else if (command === "CREATE") {
      const mailbox = args[0];
      this.onCreate(mailbox, connection, (err) => {
        if (err) {
          connection.sendError(tag, err.message ? err.message : err);
        } else {
          connection.sendSuccess(tag, "Create completed");
        }
      })
    }

    // Handle mailbox subscription
    else if (command === "SUBSCRIBE") {
      const mailbox = args[0];
      this.onSubscribe(mailbox, connection, (err) => {
        if (err) {
          connection.sendError(tag, err.message ? err.message : err);
        } else {
          connection.sendSuccess(tag, "Subscribe completed");
        }
      })
    }

    console.log(
      "TAG=" + tag + " COMMAND=" + command + " ARGS=" + args.join(",")
    );
  }

  _socketHandler(socket) {
    // Identify client
    const connection = new IMAPConnection(socket);
    let receivedData = "";

    // Send welcome message;
    connection.sendWelcomeMessage();

    // Handling incoming data
    socket.on("data", (data) => {
      receivedData += data;

      const processedCommand = IMAPProcessor(receivedData);

      if (processedCommand && processedCommand.isValid) {
        receivedData = processedCommand.dataLeft;
        this._handleCommand(connection, processedCommand.command);
      }
    });

    socket.on("error", () => {});
    socket.on("end", () => {});
  }

  listen(port, hostname, backlog, listener) {
    this.server.listen(port, hostname, backlog, listener);
  }

  close(callback) {
    this.server.close(callback);
  }
}

export default IMAPServer;
