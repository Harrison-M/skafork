const deck = require('deck');
const FeedParser = require('feedparser');
const level = require('level');
const qauth = require('qauth');
const request = require('request');
const Rx = require('rx');
const RxNode = require('rx-node');
const Twitter = require('twitter');

const genres = deck.shuffle(require('./genres'));

const db = level(__dirname + '/used.db');

qauth.init().then(function (twitterConfig) {
    const client = new Twitter(twitterConfig);

    const urls = [
        'http://pitchfork.com/rss/news',
        'http://pitchfork.com/rss/thepitch',
        'http://pitchfork.com/rss/features',
        'http://www.billboard.com/articles/rss.xml',
        'http://www.npr.org/rss/rss.php?id=1039'
    ];

    const generatedHeadlines = Rx.Observable.from(urls)
        .flatMap(u => RxNode.fromStream(request(u).pipe(new FeedParser())))
        .map(entry => entry.title)
        .map(headline => {
            const genre = genres.find(genre => genre.test(headline));
            return genre ? headline.replace(genre, ' Ska') : false;
        })
        .filter(h => h)
        .map(headline => headline.replace(/ska.*?er/g, 'Rude Boy'))
        .flatMap(headline => Rx.Observable.fromNodeCallback(
            cb => db.get(
                headline,
                err => cb(null, err && err.notFound ? headline : false)
            )
        )())
        .filter(h => h)
        .first()
        .flatMap(headline => Rx.Observable.fromNodeCallback(
            cb => client.post(
                'statuses/update',
                { status: headline.slice(0, 140) },
                (err, result) => err && err[0].code !== 187 ? cb(err) : db.put(headline, result.id, err => cb(err, headline))
            )
        )())
        .subscribe(
            () => console.log('Posted'),
            err => console.error(err)
        );
});
