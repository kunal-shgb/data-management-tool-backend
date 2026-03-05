const dateStr = '260219';
const year = parseInt(`20${dateStr.substring(0, 2)}`, 10);
const month = parseInt(dateStr.substring(2, 4), 10) - 1; // 0-based month
const day = parseInt(dateStr.substring(4, 6), 10);

const transactionDate = new Date(year, month, day);
console.log('Original String:', dateStr);
console.log('Parsed Date:', transactionDate.toString());
console.log('ISO String:', transactionDate.toISOString());
