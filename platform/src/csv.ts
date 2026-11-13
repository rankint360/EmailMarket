export function parseContacts(csv: string, secondary = "name") {
  const records: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let state: "plain" | "quoted" | "closed" = "plain";
  const field = () => {
    row.push(cell);
    cell = "";
    state = "plain";
  };
  const record = () => {
    field();
    if (row.some((value) => value !== "")) records.push(row);
    row = [];
  };
  const input = csv.replace(/^\uFEFF/, "");
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (state === "quoted") {
      if (char !== '"') cell += char;
      else if (input[i + 1] === '"') {
        cell += '"';
        i++;
      } else state = "closed";
    } else if (char === ",") field();
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && input[i + 1] === "\n") i++;
      record();
    } else if (state === "closed")
      throw new Error("Unexpected text after quoted field");
    else if (char === '"') {
      if (cell) throw new Error("Unexpected quote");
      state = "quoted";
    } else cell += char;
  }
  if (state === "quoted") throw new Error("Unclosed quoted field");
  record();
  const header = records.shift()?.map((value) => value.trim().toLowerCase());
  if (
    !header ||
    !header.includes("email") ||
    new Set(header).size !== header.length ||
    header.some((value) => value !== "email" && value !== secondary)
  )
    throw new Error("Expected email and optional " + secondary + " columns");
  if (records.length > 500) throw new Error("Maximum 500 records per import");
  return records.map((columns, index) => ({
    row: index + 2,
    email: columns[header.indexOf("email")]?.trim().toLowerCase() ?? "",
    name: columns[header.indexOf(secondary)]?.trim() ?? "",
    invalidColumns: columns.length !== header.length,
  }));
}
