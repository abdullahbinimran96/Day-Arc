// Offline Adult Content Blocklist Manager
// Open-source StevenBlack Hosts compilation (Local Offline Engine)

const fs = require('fs');
const path = require('path');

class StevenBlackBlocklist {
  constructor() {
    this.blockedDomains = new Set();
    this.isLoaded = false;
    this.listFilePath = path.join(__dirname, '..', '..', 'assets', 'adult_domains.json');
    this.adultKeywords = [
      'porn', 'xxx', 'xvideos', 'xnxx', 'xhamster', 'hentai', 'erotic', 'nsfw',
      'chaturbate', 'onlyfans', 'redtube', 'spankbang', 'brazzers', 'rule34',
      'gelbooru', 'danbooru', 'beeg', 'fapello', 'redgifs', 'motherless', 'heavy-r',
      'tblop', 'adultwork', 'livejasmin', 'bongacams', 'stripchat', 'camsoda',
      'eporner', 'hqporner', 'daftsex', 'thumbzilla', 'naughtyamerica', 'realitykings',
      'bangbros', 'mofos', 'twistys', 'playboy', 'penthouse', 'erome', 'e-hentai',
      'nhentai', 'tsumino', 'hitomi', 'hanime', 'hentaihaven', 'luscious', 'hentai2read',
      'pururin', 'simply-hentai', 'fakku', 'manyvids', 'clips4sale', 'coomer', 'kemono',
      'bdsmlr', 'fetlife', 'eroprofile', 'fuq', 'tnaflix', 'sunporno', 'empflix',
      'drtuber', 'nuvid', 'pornmd', 'extremetube', 'keezmovies', 'alphaporno', 'tubehd',
      'txxx', 'upornia', 'voyeurweb', 'hotmovs', 'tubepornclassic', 'adultfriendfinder'
    ];
  }

  load() {
    if (this.isLoaded) return;
    try {
      if (fs.existsSync(this.listFilePath)) {
        const raw = fs.readFileSync(this.listFilePath, 'utf8');
        const list = JSON.parse(raw);
        for (let i = 0; i < list.length; i++) {
          this.blockedDomains.add(list[i].toLowerCase().trim());
        }
      } else {
        this.generateDefaultList();
      }
      this.isLoaded = true;
      console.log(`Loaded ${this.blockedDomains.size} offline adult blocklist domains.`);
    } catch (e) {
      console.error('Failed to load StevenBlack blocklist:', e);
      this.generateDefaultList();
    }
  }

  generateDefaultList() {
    const coreAdult = [
      'pornhub.com', 'xvideos.com', 'xnxx.com', 'xhamster.com', 'youporn.com',
      'redtube.com', 'tube8.com', 'spankbang.com', 'beeg.com', 'chaturbate.com',
      'cam4.com', 'livejasmin.com', 'bongacams.com', 'stripchat.com', 'onlyfans.com',
      'fansly.com', 'camsoda.com', 'eporner.com', 'hqporner.com', 'daftsex.com',
      'thumbzilla.com', 'brazzers.com', 'naughtyamerica.com', 'realitykings.com',
      'bangbros.com', 'mofos.com', 'twistys.com', 'playboy.com', 'penthouse.com',
      'erome.com', 'rule34.xxx', 'gelbooru.com', 'danbooru.donmai.us', 'e-hentai.org',
      'nhentai.net', 'tsumino.com', 'hitomi.la', 'hanime.tv', 'hentaihaven.xxx',
      'heavy-r.com', 'motherless.com', 'tblop.com', 'luscious.net', 'hentai2read.com',
      'pururin.io', 'simply-hentai.com', 'fakku.net', 'manyvids.com', 'clips4sale.com',
      'fapello.com', 'coomer.party', 'coomer.su', 'kemono.party', 'kemono.su',
      'bdsmlr.com', 'fetlife.com', 'adultwork.com', 'redgifs.com', 'eroprofile.com',
      'fuq.com', 'tnaflix.com', 'sunporno.com', 'empflix.com', 'drtuber.com',
      'nuvid.com', 'pornmd.com', 'extremetube.com', 'keezmovies.com', 'alphaporno.com',
      'tubehd.xxx', 'txxx.com', 'upornia.com', 'voyeurweb.com', 'hotmovs.com',
      'tubepornclassic.com', 'porn.com', 'sex.com', 'xxx.com', 'adultfriendfinder.com',
      'passion.com', 'fling.com', 'ashleymadison.com', 'alt.com', 'flirt.com', 'benaughty.com'
    ];

    for (const d of coreAdult) {
      this.blockedDomains.add(d.toLowerCase().trim());
    }
    
    try {
      const assetsDir = path.dirname(this.listFilePath);
      if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir, { recursive: true });
      fs.writeFileSync(this.listFilePath, JSON.stringify(Array.from(this.blockedDomains), null, 2));
    } catch (err) {
      console.error('Could not write adult_domains.json:', err);
    }
  }

  isBlocked(urlOrDomain) {
    if (!this.isLoaded) this.load();
    if (!urlOrDomain) return false;

    let host = urlOrDomain;
    try {
      if (urlOrDomain.startsWith('http://') || urlOrDomain.startsWith('https://')) {
        host = new URL(urlOrDomain).hostname;
      }
    } catch (e) {
      host = urlOrDomain;
    }

    host = host.toLowerCase().trim();
    if (host.startsWith('www.')) {
      host = host.substring(4);
    }

    // 1. Direct match
    if (this.blockedDomains.has(host)) return true;

    // 2. Subdomain check (e.g. static.pornhub.com -> pornhub.com, a.b.c.redtube.com -> redtube.com)
    const parts = host.split('.');
    for (let i = 1; i < parts.length - 1; i++) {
      const parent = parts.slice(i).join('.');
      if (this.blockedDomains.has(parent)) return true;
    }

    // 3. Keyword check in hostname
    for (let i = 0; i < this.adultKeywords.length; i++) {
      const kw = this.adultKeywords[i];
      if (host.includes(kw)) return true;
    }

    return false;
  }
}

module.exports = new StevenBlackBlocklist();
