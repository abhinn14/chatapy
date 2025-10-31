// library/compressedTrie.js

class TrieNode {
  constructor(prefix = "") {
    this.prefix = prefix; // substring stored in this node
    this.isEndOfWord = false;
    this.children = {}; // map of first char -> child node
    this.user = null; // store user object if needed
  }
}

export class CompressedTrie {
  constructor() {
    this.root = new TrieNode();
  }

  // 🧠 Helper: Find common prefix length between two strings
  commonPrefixLength(a, b) {
    let len = 0;
    while (len < a.length && len < b.length && a[len] === b[len]) len++;
    return len;
  }

  // 🏗️ Insert a user (word = user's name)
  insert(user) {
    let word = user.name.toLowerCase();
    let node = this.root;
    let i = 0;

    while (i < word.length) {
      const key = word[i];
      const childExists = key in node.children;

      // No child with that starting letter → new node
      if (!childExists) {
        const newNode = new TrieNode(word.slice(i));
        newNode.isEndOfWord = true;
        newNode.user = user;
        node.children[key] = newNode;
        return;
      }

      // Otherwise, find the overlap
      const child = node.children[key];
      const prefixLen = this.commonPrefixLength(word.slice(i), child.prefix);

      // If partial overlap → split the node
      if (prefixLen < child.prefix.length) {
        const newChild = new TrieNode(child.prefix.slice(prefixLen));
        newChild.children = child.children;
        newChild.isEndOfWord = child.isEndOfWord;
        newChild.user = child.user;

        child.prefix = child.prefix.slice(0, prefixLen);
        child.children = { [newChild.prefix[0]]: newChild };
        child.isEndOfWord = false;
        child.user = null;
      }

      i += prefixLen;
      node = child;

      // If the word is fully consumed → mark as end
      if (i === word.length) {
        node.isEndOfWord = true;
        node.user = user;
        return;
      }
    }
  }

  // 🔍 Check if a full word exists (for testing)
  search(word) {
    let node = this.root;
    let i = 0;

    while (i < word.length) {
      const key = word[i];
      if (!(key in node.children)) return false;

      const child = node.children[key];
      const prefixLen = this.commonPrefixLength(word.slice(i), child.prefix);

      if (prefixLen !== child.prefix.length) return false;

      i += prefixLen;
      node = child;
    }

    return node.isEndOfWord;
  }

  // 🔎 Prefix search for dictionary-like lookup
  searchPrefix(prefix) {
    let node = this.root;
    let i = 0;

    while (i < prefix.length) {
      const key = prefix[i];
      if (!(key in node.children)) return [];

      const child = node.children[key];
      const prefixLen = this.commonPrefixLength(prefix.slice(i), child.prefix);

      if (prefixLen < child.prefix.length && prefixLen < prefix.length - i)
        return [];

      i += prefixLen;
      node = child;
    }

    return this._collect(node);
  }

  // 📦 Collect all words/users below a given node
  _collect(node) {
    let results = [];
    if (node.isEndOfWord && node.user) results.push(node.user);
    for (const key in node.children) {
      results = results.concat(this._collect(node.children[key]));
    }
    return results;
  }
}
