# Security

## What this project is

Git Guide is a static site. There is no server, no database, no accounts, and no code that runs anywhere except in your own browser. It stores nothing about you: no analytics, no cookies, no trackers, and no requests to any other host. Your progress in the sandbox is kept in your browser's local storage and never leaves the device.

That shape rules out most of what usually goes wrong. It does not rule out everything.

## What is worth reporting

- Content that would harm someone who followed it: a command whose danger level is wrong, or a destructive command whose undo is missing or does not work.
- Anything that would let one visitor affect another, or reach outside the page.
- A supply-chain problem in the workflows or scripts under `.github`.
- A dependency or action pinned to something unsafe.

Wrong or outdated advice that is merely wrong, rather than dangerous, is an ordinary bug. [Open a discussion](https://github.com/Amey-Thakur/GIT-GUIDE/discussions) for that.

## How to report

Use [private vulnerability reporting](https://github.com/Amey-Thakur/GIT-GUIDE/security/advisories/new). It goes to the maintainer and nobody else.

Please do not open a public issue for something that could be exploited before it is fixed.

Include what you found, the page or file, and what an attacker could do with it. A proof of concept helps and is welcome.

## What happens next

Reports are read and answered. Anything confirmed is fixed on the default branch, and the site updates on the next push.

You will be credited in the advisory unless you would rather not be.

## Supported versions

The deployed site is the only supported version. There are no releases to back-port to: `main` is what is live at [amey-thakur.github.io/GIT-GUIDE](https://amey-thakur.github.io/GIT-GUIDE/).
