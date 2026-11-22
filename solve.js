// Fast drop-in for csv-reader 1.0.0 (make.fun's own CSV reader).
//
// run(input) answers {columns, rows, errors} for {text, header} exactly as
// csv-reader 1.0.0 does, but faster: a whole-line fast path takes clean
// records (no quotes, no stray CR) with one split, and every other record
// is parsed with indexOf/slice jumps instead of a character-at-a-time loop.
// No field is ever built up one character at a time.
//
// The policy, as csv-reader 1.0.0 defines it:
//   - a U+FEFF at the very start of the text is dropped;
//   - a record ends at LF or CRLF, and a line left with no characters is
//     no record;
//   - outside a quoted field a CR not followed by LF is dropped
//     (stray_cr);
//   - a field that opens with a quote runs to the next quote that is not
//     doubled, "" inside it one quote, and each CRLF or lone CR inside it
//     is read as LF; what follows its closing quote, up to the next comma
//     or line break, is appended to it as it stands (quote_junk, when the
//     field ends); a quote that never closes is a literal character, and
//     the text after it is read again as an unquoted field
//     (unterminated_quote);
//   - a quote inside an unquoted field is a literal character; fields stay
//     strings, never trimmed or converted;
//   - columns is the first record when header is true, else null; rows
//     holds the records after it (every record when header is false), each
//     padded with "" (short_row, with fields: its field count) or cut
//     (long_row, with extra: the cut fields) to the first record's width;
//   - each error is {code, line, row}: line the 1-based line its record
//     starts on, row its record's index in rows (null for the header), in
//     the order met, a field's quote_junk when the field ends and a
//     record's short_row or long_row when the record ends.

const COMMA = 0; // a field ended at a comma: the record goes on
const BREAK = 1; // a field ended at a line break: the record ends
const END = 2; // a field ended at the end of the text: the record ends

/** csv-reader 1.0.0's answer for one case's input. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const n = text.length;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  let i = 0; // the next character to read
  let line = 1; // the line that character is on
  if (n > 0 && text.charCodeAt(0) === 0xfeff) i = 1;

  // The record being read: the line it starts on and the index in rows it
  // takes (null: the header). The unquoted scan reads these.
  let recLine = 1;
  let recRow = null;

  // The unquoted-field scan's result, set by unq.
  let uValue = '';
  let uEnded = END;
  let uAdded = 0;

  // Scan an unquoted field from i, with `val` already in it: a CR not
  // followed by LF is dropped (stray_cr); a quote inside is a literal
  // character. Sets uValue/uEnded/uAdded; advances i and line. `added`
  // counts the characters kept, which the quote_junk check uses.
  function unq(val) {
    let v = val;
    let added = 0;
    for (;;) {
      const c = text.indexOf(',', i);
      const nl = text.indexOf('\n', i);
      let j = -1;
      let isComma = false;
      if (c !== -1 && (nl === -1 || c < nl)) { j = c; isComma = true; }
      else if (nl !== -1) { j = nl; }
      if (j === -1) {
        // No delimiter to the end of the text.
        const f = text.slice(i);
        const r = f.indexOf('\r');
        if (r === -1) {
          v += f; added += f.length;
          i = n;
          uValue = v; uEnded = END; uAdded = added;
          return;
        }
        v += f.slice(0, r); added += r;
        errors.push({ code: 'stray_cr', line: recLine, row: recRow });
        i += r + 1;
        continue;
      }
      const f = text.slice(i, j);
      const r = f.indexOf('\r');
      if (r === -1) {
        v += f; added += f.length;
        if (isComma) { i = j + 1; uValue = v; uEnded = COMMA; uAdded = added; return; }
        i = j + 1; line += 1; uValue = v; uEnded = BREAK; uAdded = added; return;
      }
      if (r === f.length - 1 && !isComma) {
        // CRLF: the CR is the line break, not a stray one.
        v += f.slice(0, -1); added += f.length - 1;
        i = j + 1; line += 1; uValue = v; uEnded = BREAK; uAdded = added; return;
      }
      // A stray CR inside the field: drop it and keep scanning.
      v += f.slice(0, r); added += r;
      errors.push({ code: 'stray_cr', line: recLine, row: recRow });
      i += r + 1;
    }
  }

  while (true) {
    // Lines with no characters are no records.
    while (i < n) {
      const c = text.charCodeAt(i);
      if (c === 10) { i += 1; line += 1; }
      else if (c === 13 && text.charCodeAt(i + 1) === 10) { i += 2; line += 1; }
      else break;
    }
    if (i >= n) break;

    recLine = line;
    recRow = header && columns === null ? null : rows.length;

    // Fast path: a whole clean line (no quotes, no stray CR). The line is
    // one slice; its quotes and CRs are checked inside that slice only,
    // so no scan ever runs past the line's end.
    let lineEnd = text.indexOf('\n', i);
    const hasNL = lineEnd !== -1;
    if (!hasNL) lineEnd = n;
    let recEnd = lineEnd;
    if (hasNL && recEnd > i && text.charCodeAt(recEnd - 1) === 13) recEnd -= 1;
    const ls = text.slice(i, recEnd);
    if (ls.indexOf('"') === -1 && ls.indexOf('\r') === -1) {
      const fields = ls.split(',');
      i = hasNL ? lineEnd + 1 : n;
      if (hasNL) line += 1;
      if (width < 0) width = fields.length;
      if (header && columns === null) { columns = fields; continue; }
      if (fields.length < width) {
        errors.push({ code: 'short_row', line: recLine, row: recRow, fields: fields.length });
        while (fields.length < width) fields.push('');
      } else if (fields.length > width) {
        errors.push({ code: 'long_row', line: recLine, row: recRow, extra: fields.splice(width) });
      }
      rows.push(fields);
      continue;
    }

    // General path: this record holds a quote or a stray CR.
    const fields = [];
    let ended = END;
    let lastQuoted = false;
    do {
      if (text.charCodeAt(i) === 34) {
        // A quoted field: the opening quote is at i.
        const open = i;
        const openLine = line;
        let p = i + 1;
        let value = '';
        let closed = -1;
        for (;;) {
          const qq = text.indexOf('"', p);
          if (qq === -1) break;
          const seg = text.slice(p, qq);
          const brR = seg.indexOf('\r');
          const brN = seg.indexOf('\n');
          let br = -1;
          let brIsR = false;
          if (brR !== -1 && (brN === -1 || brR < brN)) { br = brR; brIsR = true; }
          else if (brN !== -1) { br = brN; }
          if (br !== -1) {
            // A line break inside the quotes: it reads as one LF.
            value += seg.slice(0, br) + '\n';
            line += 1;
            p = p + br + (brIsR && seg.charCodeAt(br + 1) === 10 ? 2 : 1);
            continue;
          }
          if (text.charCodeAt(qq + 1) === 34) { value += seg + '"'; p = qq + 2; continue; }
          value += seg;
          closed = qq + 1;
          break;
        }
        if (closed === -1) {
          // The quote never closes: it is a literal character, and the
          // text after it is read again as an unquoted field.
          i = open + 1;
          line = openLine;
          errors.push({ code: 'unterminated_quote', line: recLine, row: recRow });
          unq('"');
          fields.push(uValue);
          ended = uEnded;
          lastQuoted = true;
        } else {
          i = closed;
          if (i >= n) { fields.push(value); ended = END; }
          else {
            const c = text.charCodeAt(i);
            if (c === 44) { fields.push(value); i += 1; ended = COMMA; }
            else if (c === 10) { fields.push(value); i += 1; line += 1; ended = BREAK; }
            else if (c === 13 && text.charCodeAt(i + 1) === 10) { fields.push(value); i += 2; line += 1; ended = BREAK; }
            else {
              // What follows the closing quote is appended as it stands,
              // up to the next comma or line break (quote_junk).
              unq(value);
              if (uAdded > 0) errors.push({ code: 'quote_junk', line: recLine, row: recRow });
              fields.push(uValue);
              ended = uEnded;
            }
          }
          lastQuoted = true;
        }
      } else {
        unq('');
        fields.push(uValue);
        ended = uEnded;
        lastQuoted = false;
      }
    } while (ended === COMMA);

    // A line that held only stray CRs is left with no characters: no
    // record (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !lastQuoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) { columns = fields; continue; }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recLine, row: recRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recLine, row: recRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
