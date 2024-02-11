const EOL = "\r\n";

export default function IMAPProcessor(data) {
  const offset = data.indexOf(EOL);

  if (offset >= 0) {
    const rawCommand = data.substr(0, offset);
    const params = rawCommand.split(" ");

    const command = {
      tag: params[0],
      command: params[1]?.toUpperCase(),
      args: params.slice(2),
    };

    return {
      command,
      dataLeft: data.substr(offset + 2),
      isValid: command.tag && command.command && command.args,
    };
  }

  return null;
}
