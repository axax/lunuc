import React, { useEffect, useState, useRef } from 'react'

// One rendered log line. Entries never change once captured, so memo() renders
// each line once instead of re-rendering (and re-serializing) all previous
// entries on every new log.
const LogEntry = React.memo(({log}) => (
                    <div
                        style={{
                            marginBottom: "4px",
                            color:
                                log.type === "error"
                                    ? "red"
                                    : log.type === "warn"
                                        ? "orange"
                                        : "black",
                        }}
                    >
                        <strong>[{log.timestamp.toLocaleTimeString()}]</strong>{" "}
                        <em>{log.type.toUpperCase()}:</em>{" "}
                        {log.message.map((item, i) =>
                                typeof item === "object" ? (
                                    <pre
                                        key={i}
                                        style={{
                                            display: "inline",
                                            background: "#efefef",
                                            padding: "2px 4px",
                                            borderRadius: "4px",
                                        }}
                                    >
                                      {JSON.stringify(item, null, 2)}
                                    </pre>
                                ) : (
                                    <span key={i}>{item} </span>
                                )
                        )}
                    </div>
))

let logId = 0
// older entries are dropped: the list (and the logged objects it keeps alive) must not grow forever
const MAX_LOGS = 500

const ConsoleCapture = () => {
    const [logs, setLogs] = useState([]);
    const logContainerRef = useRef(null); // Ref for the log container

    useEffect(() => {
        // List of console methods to override
        const methods = ["log", "warn", "error", "info", "debug"];

        // Save the original console methods
        const originalMethods = {};
        methods.forEach((method) => {
            originalMethods[method] = console[method];
        });

        // Logs are collected and applied once per frame: a console call can happen while another
        // component renders (setState there is not allowed), and many logs cause only one render
        let queue = [], frame = null
        const flush = () => {
            frame = null
            const entries = queue
            queue = []
            setLogs((prevLogs) => {
                const next = prevLogs.concat(entries)
                return next.length > MAX_LOGS ? next.slice(next.length - MAX_LOGS) : next
            })
        }

        // Override console methods
        methods.forEach((method) => {
            console[method] = (...args) => {
                // Capture the log with method type
                queue.push({ type: method, message: args, timestamp: new Date(), id: ++logId });
                if (queue.length > MAX_LOGS) queue.shift()
                if (frame === null) frame = requestAnimationFrame(flush)

                // Call the original console method
                originalMethods[method].apply(console, args);

            };
        });

        // Cleanup: Restore the original console methods on component unmount
        return () => {
            if (frame !== null) cancelAnimationFrame(frame)
            methods.forEach((method) => {
                console[method] = originalMethods[method];
            });
        };
    }, []);

    useEffect(() => {
        // Auto-scroll to the bottom whenever logs are updated
        if (logContainerRef.current) {
            logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
        }
    }, [logs]); // Dependency on logs to trigger scrolling

    return (<div
                ref={logContainerRef} // Attach the ref to the scrollable container
                style={{
                    height: "100%",
                    overflowY: "scroll",
                    border: "1px solid #ccc",
                    padding: "10px",
                    backgroundColor: "#f9f9f9",
                    lineHeight:1.2,
                    fontSize:'10px'
                }}
            >
                {logs.map((log) => (
                    <LogEntry key={log.id} log={log}/>
                ))}
            </div>
    );
}

export default ConsoleCapture;