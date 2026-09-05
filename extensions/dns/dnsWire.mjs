// Pure DNS wire-format helpers. No state, no I/O, no dns2 - everything in here
// operates on Buffers only, which is what makes it testable in isolation.
//
// Background: dns2 has no Resource codec for SVCB (64) / HTTPS (65). It fails to
// parse such an upstream reply, the resolve promise never settles and the query
// dies in an internal timeout. Forwarding raw bytes avoids the codec entirely
// and works for every present and future record type.
//
// RFC 9460 forbids name compression inside SVCB/HTTPS RDATA, which is what makes
// verbatim forwarding safe there. For other types we never rewrite RDATA either
// - the whole packet is passed through, so compression pointers keep pointing
// into the same buffer they were written for.

export const encodeName = (name) => {
    const parts = []
    for (const label of name.split('.')) {
        if (label.length === 0) {
            continue
        }
        const buf = Buffer.from(label, 'utf8')
        if (buf.length > 63) {
            throw new Error(`DNS: label too long in ${name}`)
        }
        parts.push(Buffer.from([buf.length]), buf)
    }
    parts.push(Buffer.from([0])) // root label
    return Buffer.concat(parts)
}

// Question-only query with an EDNS0 OPT record (1232 byte payload), so large
// answers (DKIM/SPF TXT, DNSSEC, big A sets) don't come back truncated.
export const buildRawQuery = (name, type, klass, id) => {
    const header = Buffer.alloc(12)
    header.writeUInt16BE(id, 0)
    header.writeUInt16BE(0x0100, 2) // standard query, recursion desired
    header.writeUInt16BE(1, 4)      // qdcount
    header.writeUInt16BE(1, 10)     // arcount (the OPT record below)

    const tail = Buffer.alloc(4)
    tail.writeUInt16BE(type, 0)
    tail.writeUInt16BE(klass || 1, 2)

    // OPT: root name | type 41 | class = udp payload size (1232) | ttl | rdlength
    const opt = Buffer.from([0x00, 0x00, 0x29, 0x04, 0xd0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00])

    return Buffer.concat([header, encodeName(name), tail, opt])
}

// Skip over a wire-format name. We never need to read it, only to know where it
// ends - which keeps this independent of the record type.
export const skipName = (buf, offset) => {
    while (offset < buf.length) {
        const len = buf.readUInt8(offset)
        if (len === 0) {
            return offset + 1
        }
        if ((len & 0xc0) === 0xc0) {
            if (offset + 2 > buf.length) {
                throw new Error('truncated compression pointer')
            }
            return offset + 2 // pointer is always the last element of a name
        }
        offset += 1 + len
    }
    throw new Error('malformed name')
}

// Locate every resource record's TTL field so we can age them on the way out,
// and take the smallest TTL as the cache lifetime. Type-agnostic: names and
// rdata are skipped, never interpreted.
export const scanTtls = (buf) => {
    if (buf.length < 12) {
        throw new Error('short header')
    }
    const qdcount = buf.readUInt16BE(4)
    const rrcount = buf.readUInt16BE(6) + buf.readUInt16BE(8) + buf.readUInt16BE(10)

    let offset = 12
    for (let i = 0; i < qdcount; i++) {
        offset = skipName(buf, offset) + 4
        if (offset > buf.length) {
            throw new Error('truncated question')
        }
    }

    const ttlOffsets = []
    let minTtl = Infinity
    for (let i = 0; i < rrcount; i++) {
        offset = skipName(buf, offset)
        if (offset + 10 > buf.length) {
            throw new Error('truncated record')
        }
        const type = buf.readUInt16BE(offset)
        const ttlOffset = offset + 4
        const rdlength = buf.readUInt16BE(offset + 8)
        // OPT (41) stores flags in the ttl field, not a lifetime - it must not
        // pull minTtl down to 0 and must not be aged.
        if (type !== 41) {
            ttlOffsets.push(ttlOffset)
            const ttl = buf.readUInt32BE(ttlOffset)
            if (ttl < minTtl) {
                minTtl = ttl
            }
        }
        offset += 10 + rdlength
        if (offset > buf.length) {
            throw new Error('rdlength beyond packet')
        }
    }

    return {ttlOffsets, minTtl: minTtl === Infinity ? 0 : minTtl}
}

// Build the datagram for one specific client out of the cached upstream reply.
// `answer` is {raw, questionNameLength, ttlOffsets, storedAt}.
export const materializeRaw = (answer, id, questionName, now = Date.now()) => {
    const out = Buffer.from(answer.raw)
    out.writeUInt16BE(id, 0)

    // Echo the name exactly as the client spelled it: we always query upstream
    // in lower case, but 0x20-randomising resolvers compare the echo byte for
    // byte and discard anything that differs. Same name, same length - answer
    // records referencing it by compression pointer follow automatically.
    if (answer.questionNameLength) {
        const asked = encodeName(questionName)
        if (asked.length === answer.questionNameLength && 12 + asked.length <= out.length) {
            asked.copy(out, 12)
        }
    }

    // Age the TTLs by however long the entry sat in our cache, so downstream
    // resolvers don't hold a record longer than its origin allows.
    if (answer.ttlOffsets && answer.ttlOffsets.length > 0 && answer.storedAt) {
        const age = Math.floor((now - answer.storedAt) / 1000)
        if (age > 0) {
            for (const ttlOffset of answer.ttlOffsets) {
                const ttl = out.readUInt32BE(ttlOffset)
                out.writeUInt32BE(Math.max(1, ttl - age), ttlOffset)
            }
        }
    }

    return out
}

// Cut the reply back to header + question and set TC. Safe without a parser:
// the question section is echoed verbatim, so its length is the one we encoded.
export const truncateRaw = (raw, questionName) => {
    const questionEnd = 12 + encodeName(questionName).length + 4
    if (raw.length <= questionEnd) {
        return raw
    }
    const out = Buffer.alloc(questionEnd)
    raw.copy(out, 0, 0, questionEnd)
    out.writeUInt8(out.readUInt8(2) | 0x02, 2) // TC
    out.writeUInt16BE(0, 6)  // ancount
    out.writeUInt16BE(0, 8)  // nscount
    out.writeUInt16BE(0, 10) // arcount
    return out
}
