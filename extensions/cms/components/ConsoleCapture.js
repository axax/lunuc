import React, { useEffect, useState, useRef } from 'react'

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

        // Override console methods
        methods.forEach((method) => {
            console[method] = (...args) => {
                // Capture the log with method type
                const logEntry = { type: method, message: args, timestamp: new Date() };

                // Update the state with the new log entry
                setLogs((prevLogs) => [...prevLogs, logEntry]);

                // Call the original console method
                originalMethods[method].apply(console, args);

            };
        });

        // Cleanup: Restore the original console methods on component unmount
        return () => {
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
                {logs.map((log, index) => (
                    <div
                        key={index}
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
                ))}
            </div>
    );
}

export default ConsoleCapture;