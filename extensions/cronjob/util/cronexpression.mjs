const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];

const WEEKDAYS = [
    'Sunday', 'Monday', 'Tuesday', 'Wednesday',
    'Thursday', 'Friday', 'Saturday'
];

const parseTimeUnit = (value, type) => {
    if (value === '*') return 'every';
    if (value.includes('/')) {
        const [, interval] = value.split('/');
        if (type === 'minute') {
            return interval === '1' ? 'minute' : `${interval} minutes`;
        }
        if (type === 'hour') {
            return interval === '1' ? 'hour' : `${interval} hours`;
        }
        return `every ${interval}`;
    }
    if (value.includes('-')) {
        const [start, end] = value.split('-');
        if (type === 'month') {
            return `from ${MONTHS[parseInt(start) - 1]} to ${MONTHS[parseInt(end) - 1]}`;
        }
        if (type === 'weekday') {
            return `from ${WEEKDAYS[parseInt(start)]} to ${WEEKDAYS[parseInt(end)]}`;
        }
        return `from ${start} to ${end}`;
    }
    if (value.includes(',')) {
        const values = value.split(',');
        if (type === 'month') {
            return values.map(v => MONTHS[parseInt(v) - 1]).join(', ');
        }
        if (type === 'weekday') {
            return values.map(v => WEEKDAYS[parseInt(v)]).join(', ');
        }
        return values.join(', ');
    }

    if (type === 'month') return MONTHS[parseInt(value) - 1];
    if (type === 'weekday') return WEEKDAYS[parseInt(value)];
    return value;
};

export const cronToReadableString = (cronExpression) => {
    if(!cronExpression){
        return 'never'
    }
    if(cronExpression==='STARTUP'){
        return 'runs only once on startup'
    }
    try {
        const [minute, hour, dayOfMonth, month, dayOfWeek] = cronExpression.split(' ');

        const parts = [
            { value: minute, type: 'minute' },
            { value: hour, type: 'hour' },
            { value: dayOfMonth, type: 'day' },
            { value: month, type: 'month' },
            { value: dayOfWeek, type: 'weekday' }
        ];

        // Special case for "every X minutes"
        if (minute.includes('/') && hour === '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
            const [, interval] = minute.split('/');
            return `Every ${interval} minutes`;
        }

        // Special case for "every X hours"
        if (minute === '0' && hour.includes('/') && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
            const [, interval] = hour.split('/');
            return `Every ${interval} hours`;
        }

        const readableParts = [];

        // Handle minutes
        if (minute !== '*') {
            readableParts.push(`at minute ${parseTimeUnit(minute, 'minute')}`);
        }

        // Handle hours
        if (hour !== '*') {
            readableParts.push(`at hour ${parseTimeUnit(hour, 'hour')}`);
        }

        // Handle days of month
        if (dayOfMonth !== '*') {
            readableParts.push(`on day ${parseTimeUnit(dayOfMonth, 'day')}`);
        }

        // Handle months
        if (month !== '*') {
            readableParts.push(`in ${parseTimeUnit(month, 'month')}`);
        }

        // Handle days of week
        if (dayOfWeek !== '*') {
            readableParts.push(`on ${parseTimeUnit(dayOfWeek, 'weekday')}`);
        }

        // If everything is *, it means "every minute"
        if (readableParts.length === 0) {
            return 'every minute';
        }

        return readableParts.join(' ');
    } catch (error) {
        console.error('Invalid cron expression:', error);
        return 'Invalid cron expression';
    }
}