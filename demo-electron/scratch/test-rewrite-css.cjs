function rewriteSelectorText(selector) {
  return selector
    .split(",")
    .map(sel => {
      const trimmed = sel.trim();
      if (!trimmed.includes(">")) return sel;

      const parts = [];
      let currentPart = "";
      let depth = 0;
      for (let i = 0; i < trimmed.length; i++) {
        const char = trimmed[i];
        if (char === "(") {
          depth++;
          currentPart += char;
        } else if (char === ")") {
          depth--;
          currentPart += char;
        } else if (char === ">" && depth === 0) {
          parts.push(currentPart.trim());
          currentPart = "";
        } else {
          currentPart += char;
        }
      }
      parts.push(currentPart.trim());

      if (parts.length === 0 || !parts[0]) return sel;

      let combinations = [[parts[0]]];
      for (let i = 1; i < parts.length; i++) {
        const nextPart = parts[i];
        if (nextPart === undefined) continue;
        const newCombinations = [];
        for (const combo of combinations) {
          newCombinations.push([...combo, nextPart]);
          newCombinations.push([...combo, ".canvus-node-wrapper", nextPart]);
        }
        combinations = newCombinations;
      }

      return combinations.map(combo => combo.join(" > ")).join(", ");
    })
    .join(", ");
}

function rewriteCSS(css) {
  let result = "";
  let currentStatement = "";
  let inString = null;
  let inComment = false;
  let parenDepth = 0;

  for (let i = 0; i < css.length; i++) {
    const char = css[i];
    const nextChar = css[i + 1];

    if (inComment) {
      currentStatement += char;
      if (char === "*" && nextChar === "/") {
        inComment = false;
        currentStatement += "/";
        i++;
      }
      continue;
    }

    if (inString) {
      currentStatement += char;
      if (char === inString && css[i - 1] !== "\\") {
        inString = null;
      }
      continue;
    }

    if (char === "/" && nextChar === "*") {
      inComment = true;
      currentStatement += "/*";
      i++;
      continue;
    }

    if (char === '"' || char === "'") {
      inString = char;
      currentStatement += char;
      continue;
    }

    if (char === "(") {
      parenDepth++;
      currentStatement += char;
      continue;
    }

    if (char === ")") {
      parenDepth = Math.max(0, parenDepth - 1);
      currentStatement += char;
      continue;
    }

    if (parenDepth > 0) {
      currentStatement += char;
      continue;
    }

    if (char === "{") {
      const trimmed = currentStatement.trim();
      if (trimmed.startsWith("@")) {
        result += currentStatement + "{";
      } else {
        result += rewriteSelectorText(currentStatement) + "{";
      }
      currentStatement = "";
      continue;
    }

    if (char === ";") {
      result += currentStatement + ";";
      currentStatement = "";
      continue;
    }

    if (char === "}") {
      const trimmed = currentStatement.trim();
      if (trimmed) {
        result += currentStatement;
      }
      result += "}";
      currentStatement = "";
      continue;
    }

    currentStatement += char;
  }

  result += currentStatement;
  return result;
}

const inputCSS = `
@layer reset, base, composition, features, utilities;

@layer features {
  @scope (.scope.product-cards) to (.scope) {
    :scope {
      container: --scope / inline-size;
    }

    ._card-list {
      & > * {
        grid-row: span 5;
      }
    }

    ._card {
      color: var(--card-foreground);
      & > * {
        grid-column: --full;
      }
    }
  }

  @scope (.purchase-button) {
    :scope {
      display: flex;
      &::before {
        content: "";
        mask-image: var(--icon-cart);
      }
    }
  }
}
`;

console.log("Rewritten CSS:\n", rewriteCSS(inputCSS));
