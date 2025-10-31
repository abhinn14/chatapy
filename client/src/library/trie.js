export class TrieNode {
  constructor() {
    this.children = {};
    this.isEnd = false;
    this.user = null; // store the full user object
  }
}

export class Trie {
  constructor() {
    this.root = new TrieNode();
  }

  insert(user) {
    let node = this.root;
    const name = user.name.toLowerCase();
    for (const ch of name) {
      if (!node.children[ch]) node.children[ch] = new TrieNode();
      node = node.children[ch];
    }
    node.isEnd = true;
    node.user = user;
  }

  searchPrefix(prefix) {
    let node = this.root;
    const lower = prefix.toLowerCase();
    for (const ch of lower) {
      if (!node.children[ch]) return [];
      node = node.children[ch];
    }
    return this.collect(node);
  }

  collect(node) {
    let results = [];
    if (node.isEnd && node.user) results.push(node.user);
    for (const ch in node.children) {
      results = results.concat(this.collect(node.children[ch]));
    }
    return results;
  }
}
