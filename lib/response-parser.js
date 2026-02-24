function clean(text) {
  return (text || "").replace(/\r\n/g, "\n").trim();
}

function fromXmlTags(text) {
  const sfwMatch = text.match(/<SFW>\s*([\s\S]*?)\s*<\/SFW>/i);
  const nsfwMatch = text.match(/<NSFW>\s*([\s\S]*?)\s*<\/NSFW>/i);
  if (!sfwMatch || !nsfwMatch) {
    return null;
  }
  return { sfw: clean(sfwMatch[1]), nsfw: clean(nsfwMatch[1]) };
}

function fromHeadings(text) {
  const match = text.match(/SFW\s*:\s*([\s\S]*?)\n\s*NSFW\s*:\s*([\s\S]*)/i);
  if (!match) {
    return null;
  }
  return { sfw: clean(match[1]), nsfw: clean(match[2]) };
}

function fromJsonObject(text) {
  const direct = text.match(/\{[\s\S]*\}/);
  if (!direct) {
    return null;
  }
  try {
    const parsed = JSON.parse(direct[0]);
    if (parsed && typeof parsed.sfw === "string" && typeof parsed.nsfw === "string") {
      return { sfw: clean(parsed.sfw), nsfw: clean(parsed.nsfw) };
    }
  } catch {
    return null;
  }
  return null;
}

function parseSfwNsfw(text) {
  const src = clean(text);
  return fromXmlTags(src) || fromHeadings(src) || fromJsonObject(src);
}

module.exports = {
  parseSfwNsfw,
};
