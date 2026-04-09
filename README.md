# simple-project-tool

This is a simple app to help managing projects.

Key features:
2 user types:
    - manager/contributor
    can create/remove projects, but also contribute to them
    - contributor
    limited management of projects

Project structure (items): (Multiple projects allowed)
Project (contains stories)
    story (contains task)
       task

Each Item (project story or task) can have following state:
(to do, in progress, in review, in testing, done)

each item can have comments
each item should have priority value (low/med/high)

Each user can invite others to contribute on the projects. This should be manageable at the project level or globally. We should support normal users as well as AI agents


Simple, minimalistic design
A config page to manage api keys, display, contributors, etc
Everything should be manageable via an API
Data is stored in a database
- we need to create structure here

