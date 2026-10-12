# Stock Price Checker

A full-stack JavaScript implementation of the freeCodeCamp Stock Price Checker project.

## Run
```bash
npm install
npm start
```
Open http://localhost:3000.

## Tests
```bash
npm test
```
The tests use the freeCodeCamp stock proxy, so internet access is required.

## API
- `/api/stock-prices?stock=GOOG`
- `/api/stock-prices?stock=GOOG&like=true`
- `/api/stock-prices?stock=GOOG&stock=MSFT`
- `/api/stock-prices?stock=GOOG&stock=MSFT&like=true`

Likes are held in process memory and are reset when the server restarts. IP addresses are hashed before being used for per-IP like tracking; raw IP addresses are not stored.
