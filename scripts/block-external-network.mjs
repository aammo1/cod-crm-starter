// Verification-only preload. No credentials/URLs are included in denials.
// Mock transports may replace fetch explicitly; all real sockets stay local.
import net from "node:net";
import { syncBuiltinESMExports } from "node:module";
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  // Node's normalized connect arguments are sometimes passed as a tuple.
  const options = Array.isArray(args[0]) ? args[0][0] : args[0];
  const host = typeof options === "object" ? options.host : typeof args[1] === "string" ? args[1] : "localhost";
  if (host && !["localhost", "127.0.0.1", "::1", "[::1]"].includes(host)) {
    throw new Error("External networking blocked during CRM verification");
  }
  return connect.apply(this, args);
};
syncBuiltinESMExports();
