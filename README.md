# Lucas Wu — portfolio

A static portfolio for GitHub Pages. There are no runtime dependencies or package installations.

## Preview locally

From this folder:

```sh
python -m http.server 8000 --bind 127.0.0.1
```

Open http://127.0.0.1:8000/. The project index is at `/projects/`.

## Edit a project

1. Edit `content/projects.json`. Each entry contains the project's text, skills, links, cover image, and galleries.
2. Run `node tools/build-projects.mjs` from this folder.
3. Refresh the browser. For deployment, include the generated HTML files in your Git commit.

The generator updates the homepage previews, `projects/index.html`, and `projects/<slug>/index.html`. Change the reusable page structure in `templates/project.html` or `templates/projects.html`, not in generated pages. Project text is present in the HTML and works without JavaScript.

The `featured` list selects and orders exactly three homepage previews. The first is wide. The order of entries in `projects` controls the project index and the “Next project” links.

## Add your images

Put files in `assets/projects/<slug>/`. Use lowercase, hyphenated filenames, for example `assets/projects/vex-robotics/competition-robot.jpg`.

To replace the symbolic illustration with your own image, change `cover` from `null` to an object:

```json
"cover": {
  "src": "/assets/projects/vex-robotics/competition-robot.jpg",
  "alt": "Describe the robot and what is visible in the photo",
  "caption": "Write a caption for this photo."
}
```

That image is used on the homepage/index card and at the top of the project page. Cards crop to their frame; the project page displays the complete image.

Each project's `images` list accepts zero, one, or any number of images:

```json
"images": [
  {
    "src": "/assets/projects/vex-robotics/competition-robot.jpg",
    "alt": "Describe what is visible in the photo",
    "caption": "An optional caption.",
    "wide": true
  },
  {
    "src": "/assets/projects/vex-robotics/intake-detail.jpg",
    "alt": "Describe the intake shown here",
    "caption": "Another optional caption."
  }
]
```

Empty galleries are omitted entirely. One image fills the width. Multiple images use two columns on desktop and one on mobile; an odd-numbered gallery starts with a full-width image. `wide: true` can make any image full-width. Images retain their proportions and link to the original file. The build checks that files exist and have alt text.

For images beside a particular part of the story, add an `images` list inside any entry in `sections`. It uses the same format. You can have both section images and the main gallery.

## Add a project

Copy an object in `content/projects.json`, give it a unique lowercase hyphenated `slug`, and replace its content. Keep `links`, `highlights`, and `images` as empty lists when unused. `cover: null` uses the symbolic illustration. Supported illustration styles are `chip`, `landmarks`, `robot`, `rays`, and `community`.

Run the generator to create its page and add it to the index. If you rename or remove a project, remove its old generated `projects/<slug>/` folder as well so the old page is not published.

To check galleries, content validation, and local links after editing, run `node --test tools/build-projects.test.mjs`.

## File map

- `index.html`: homepage. Content between the featured-project markers is generated.
- `content/projects.json`: editable project content and image lists.
- `templates/`: shared page layouts.
- `tools/build-projects.mjs`: dependency-free static page generator.
- `projects/`: generated project index and individual pages.
- `projects.css`: project previews, page layouts, galleries, and responsive styles.
- `styles.css`: existing site styling and homepage animation layout.
- `site.js`: shared reveal effects and footer year.
- `galaxy.js`: shared Milky Way background and motion preference on every page.
- `app.js`: homepage planet animation and scroll effects.
- `planet-renderer.js`: WebGL planet renderer.

Project drafts were adapted from the supplied resumes. UWASIC's ongoing ray-tracing ASIC work is distinguished from its completed SPI/PWM onboarding project. Illustrations are symbolic, not project screenshots. Replace them with your own images as they become available.
