/* eslint-disable no-unused-expressions, no-undef */
const path = require('node:path');
const fs = require('node:fs');
const {expect} = require('chai');
const {sync: rimraf} = require('rimraf');
const write = require('write');
const sinon = require('sinon');
const {readJSON} = require('../../src/utils.js');
const flatCache = require('../../src/cache.js');
const {del} = require('../../src/del.js');

describe('flat-cache', () => {
	beforeEach(() => {
		flatCache.clearAll();
		rimraf(path.resolve(__dirname, '../fixtures/.cache/'));
		rimraf(path.resolve(__dirname, '../fixtures/.cache2/'));
	});

	afterEach(() => {
		flatCache.clearAll();
		rimraf(path.resolve(__dirname, '../fixtures/.cache/'));
		rimraf(path.resolve(__dirname, '../fixtures/.cache2/'));
	});

	it('should not crash if the cache file exists but it is an empty string', () => {
		const cachePath = path.resolve(__dirname, '../fixtures/.cache2');
		write.sync(path.join(cachePath, 'someId'), '');

		expect(() => {
			const cache = flatCache.load('someId', cachePath);
			expect(cache._persisted).to.deep.equal({});
		}).to.not.throw(Error);
	});

	it('should not crash if the cache file exists but it is an invalid JSON string', () => {
		const cachePath = path.resolve(__dirname, '../fixtures/.cache2');
		write.sync(path.join(cachePath, 'someId'), '{ "foo": "fookey", "bar" ');

		expect(() => {
			const cache = flatCache.load('someId', cachePath);
			expect(cache._persisted).to.deep.equal({});
		}).to.not.throw(Error);
	});

	it('should create a cache object if none existed in disc with the given id', () => {
		const cache = flatCache.load('someId');
		expect(cache.keys().length).to.equal(0);
	});

	it('should set a key and persist it', () => {
		const cache = flatCache.load('someId');
		const data = {
			foo: 'foo',
			bar: 'bar',
		};

		cache.setKey('some-key', data);
		expect(cache.getKey('some-key')).to.deep.equal(data);

		cache.save();
		expect(readJSON(path.resolve(__dirname, '../../.cache/someId'))['some-key']).to.deep.equal(data);
	});

	it('should remove a key from the cache object and persist the change', () => {
		const cache = flatCache.load('someId');
		const data = {
			foo: 'foo',
			bar: 'bar',
		};

		cache.setKey('some-key', data);
		expect(cache.getKey('some-key')).to.deep.equal(data);
		cache.save();

		cache.removeKey('some-key');
		expect(
			readJSON(path.resolve(__dirname, '../../.cache/someId'))['some-key'],
			'value is still in the persisted storage',
		).to.deep.equal(data);

		cache.save();
		expect(readJSON(path.resolve(__dirname, '../../.cache/someId'))['some-key']).to.be.undefined;
	});

	describe('loading an existing cache', () => {
		beforeEach(() => {
			const cache = flatCache.load('someId');
			cache.setKey('foo', {
				bar: 'baz',
			});
			cache.setKey('bar', {
				foo: 'baz',
			});
			cache.save();
		});

		it('should load an existing cache', () => {
			const cache = flatCache.load('someId');
			expect(readJSON(path.resolve(__dirname, '../../.cache/someId'))).to.deep.equal(cache._persisted);
		});

		it('should return the same structure if load called twice with the same docId', () => {
			const cache = flatCache.load('someId');
			const cache2 = flatCache.load('someId');

			expect(cache._persisted).to.deep.equal(cache2._persisted);
		});

		it('should remove the key and persist the new state', () => {
			const cache = flatCache.load('someId');
			cache.removeKey('foo');
			cache.save();
			expect(readJSON(path.resolve(__dirname, '../../.cache/someId'))).to.deep.equal({
				bar: {
					foo: 'baz',
				},
			});
		});

		it('should clear the cache identified by the given id', () => {
			const cache = flatCache.load('someId');
			cache.save();
			let exists = fs.existsSync(path.resolve(__dirname, '../../.cache/someId'));
			expect(exists).to.be.true;

			let deleted = flatCache.clearCacheById('someId');
			exists = fs.existsSync(path.resolve(__dirname, '../../.cache/someId'));
			expect(deleted).to.be.true;
			expect(exists).to.be.false;

			deleted = flatCache.clearCacheById('someId');
			expect(deleted).to.be.false;
		});
	});

	describe('loading an existing cache custom directory', () => {
		beforeEach(() => {
			const cache = flatCache.load('someId', path.resolve(__dirname, '../fixtures/.cache2'));
			cache.setKey('foo', {
				bar: 'baz',
			});
			cache.setKey('bar', {
				foo: 'baz',
			});
			cache.save();
		});

		it('should load an existing cache', () => {
			const cache = flatCache.load('someId', path.resolve(__dirname, '../fixtures/.cache2'));
			expect(readJSON(path.resolve(__dirname, '../fixtures/.cache2/someId'))).to.deep.equal(cache._persisted);
		});

		it('should return the same structure if load called twice with the same docId', () => {
			const cache = flatCache.load('someId', path.resolve(__dirname, '../fixtures/.cache2'));
			const cache2 = flatCache.load('someId', path.resolve(__dirname, '../fixtures/.cache2'));

			expect(cache._persisted).to.deep.equal(cache2._persisted);
		});

		it('should remove the cache file from disk using flatCache.clearCacheById', () => {
			const cache = flatCache.load('someId', path.resolve(__dirname, '../fixtures/.cache2'));
			cache.save();
			expect(fs.existsSync(path.resolve(__dirname, '../fixtures/.cache2/someId'))).to.be.true;
			flatCache.clearCacheById('someId', path.resolve(__dirname, '../fixtures/.cache2'));
			expect(fs.existsSync(path.resolve(__dirname, '../fixtures/.cache2/someId'))).to.be.false;
		});

		it('should remove the cache file from disk using removeCacheFile', () => {
			const cache = flatCache.load('someId', path.resolve(__dirname, '../fixtures/.cache2'));
			cache.save();
			expect(fs.existsSync(path.resolve(__dirname, '../fixtures/.cache2/someId'))).to.be.true;
			cache.removeCacheFile();
			expect(fs.existsSync(path.resolve(__dirname, '../fixtures/.cache2/someId'))).to.be.false;
		});
	});

	describe('del', () => {
		let sandbox;

		beforeEach(() => {
			// Create a sandbox to stub methods
			sandbox = sinon.createSandbox();
		});

		afterEach(() => {
			// Restore the original methods
			sandbox.restore();
		});

		it('should catch and log an error when deletion fails', () => {
			// Arrange
			const fakePath = '/path/to/fake/dir';
			sandbox.stub(fs, 'existsSync').returns(true);
			sandbox.stub(fs, 'statSync').returns({isDirectory: () => true});
			sandbox.stub(fs, 'readdirSync').returns(['file1', 'file2']);
			sandbox.stub(path, 'join').returns(fakePath);
			const error = new Error('Fake error');
			sandbox.stub(fs, 'unlinkSync').throws(error);

			const consoleLog = console.error;
			console.error = function () {};

			try {
				del(fakePath);
			} catch (error_) {
				// Assert
				expect(error_).to.contain('/path/to/fake/dir');
			}

			console.error = consoleLog;
		});
	});

	describe('loading a cache using a filePath directly', () => {
		let file;

		beforeEach(() => {
			file = path.resolve(__dirname, '../fixtures/.cache2/mycache-file.cache');
			rimraf(file);
		});

		it('should create the file if it does not exists before', () => {
			const cache = flatCache.createFromFile(file);
			cache.setKey('foo', {
				bar: 'baz',
			});
			cache.setKey('bar', {
				foo: 'baz',
			});

			expect(fs.existsSync(file)).to.be.false;
			cache.save();
			expect(fs.existsSync(file)).to.be.true;
		});

		it('should delete the cache file using removeCacheFile', () => {
			const cache = flatCache.createFromFile(file);
			cache.setKey('foo', {
				bar: 'baz',
			});
			cache.setKey('bar', {
				foo: 'baz',
			});

			expect(fs.existsSync(file)).to.be.false;
			cache.save();
			expect(fs.existsSync(file)).to.be.true;
			cache.removeCacheFile();

			expect(cache.getKey('foo')).to.deep.equal({
				bar: 'baz',
			});

			expect(fs.existsSync(file)).to.be.false;
		});

		it('should delete the cache file using destroy', () => {
			const cache = flatCache.createFromFile(file);
			cache.setKey('foo', {
				bar: 'baz',
			});
			cache.setKey('bar', {
				foo: 'baz',
			});

			expect(fs.existsSync(file)).to.be.false;
			cache.save();
			expect(fs.existsSync(file)).to.be.true;
			cache.destroy();

			expect(cache.getKey('foo')).to.be.undefined;

			expect(fs.existsSync(file)).to.be.false;
		});

		it('should remove non "visited" entries', () => {
			// A visited entry is one that was either queried
			// using getKey or updated with setKey
			let cache = flatCache.createFromFile(file);

			cache.setKey('foo', {
				bar: 'baz',
			});
			cache.setKey('bar', {
				foo: 'baz',
			});

			cache.save();

			let expectedResult = {
				bar: {
					foo: 'baz',
				},
				foo: {
					bar: 'baz',
				},
			};

			// First we expect to see both keys being persisted
			expect(expectedResult).to.deep.equal(readJSON(file));

			// Then we create the load the cache again
			cache = flatCache.createFromFile(file);

			// We query one key (visit)
			const res = cache.getKey('foo');

			// Then we check the value is what we stored
			expect(res).to.deep.equal({
				bar: 'baz',
			});

			cache.save();

			expectedResult = {
				foo: {
					bar: 'baz',
				},
			};

			expect(expectedResult).to.deep.equal(readJSON(file));
		});

		it('should keep non "visited" entries if noProne is set to true', () => {
			// A visited entry is one that was either queried
			// using getKey or updated with setKey
			let cache = flatCache.createFromFile(file);

			cache.setKey('foo', {
				bar: 'baz',
			});
			cache.setKey('bar', {
				foo: 'baz',
			});

			// First time noPrune will have no effect,
			// because all keys were visited
			cache.save();

			const expectedResult = {
				bar: {
					foo: 'baz',
				},
				foo: {
					bar: 'baz',
				},
			};

			// First we expect to see both keys being persisted
			expect(expectedResult).to.deep.equal(readJSON(file));

			// Then we create the load the cache again
			cache = flatCache.createFromFile(file);

			// We query one key (visit)
			const res = cache.getKey('foo');

			// Then we check the value is what we stored
			expect(res).to.deep.equal({
				bar: 'baz',
			});

			cache.save(true /* noPrune */);

			expect(expectedResult).to.deep.equal(readJSON(file));
		});
	});

	it('should serialize and deserialize properly circular reference', () => {
		const cache = flatCache.load('someId');
		const data = {
			foo: 'foo',
			bar: 'bar',
		};

		data.circular = data;

		cache.setKey('some-key', data);
		expect(cache.getKey('some-key')).to.deep.equal(data);

		cache.save();
		expect(readJSON(path.resolve(__dirname, '../../.cache/someId'))['some-key']).to.deep.equal(data);
	});

	it('should return the entire persisted object', () => {
		const cache = flatCache.load('someId');
		const data = {
			foo: 'foo',
			bar: true,
			x: ['0', '1'],
		};

		cache.setKey('some-key', data);

		const data2 = {
			key: 9,
			z: {
				x: [true, false],
			},
		};

		cache.setKey('some-second-key', data2);

		const data3 = true;

		cache.setKey('some-third-key', data3);

		expect(cache.all()).to.deep.equal({
			'some-key': data,
			'some-second-key': data2,
			'some-third-key': data3,
		});
	});
});
