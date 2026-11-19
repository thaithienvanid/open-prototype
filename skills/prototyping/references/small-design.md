# The loop on one small design

Read this before your first design: it runs the skill's loop on one screen. The screen has three states, real copy in the example data, and every colour from a token. Each state gives one next step, which is a control on that state:

```html
<!doctype html>
<html lang="en" data-proto-format="1">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="platforms" content="web"><meta name="themes" content="light dark">
<title>Saved items</title>
<style data-proto-tokens>:root { color-scheme: light dark; --space: 1rem; --surface: light-dark(#fafafb, #111317); --text: light-dark(#1c1e21, #dfe2e6); --edge: light-dark(#858b94, #6b717a); }</style>
<style>body { margin: 0; padding: var(--space); font: 0.875rem/1.43 system-ui, sans-serif; background: var(--surface); color: var(--text); }
button { font: inherit; min-height: 2.75rem; padding: 0 var(--space); border: 1px solid var(--edge); background: transparent; color: inherit; }</style>
</head>
<body>
<main><h1 data-proto-slot="title"></h1>
<section data-proto-screen="list" data-proto-title="Saved items" data-proto-initial="ready">
  <div data-proto-state="ready" data-testid="list-ready"><ul data-proto-list="items"><template data-proto-item><li data-proto-field="name"></li></template></ul><button type="button" data-proto-go="list/empty" data-testid="list-clear" data-proto-text="clear"></button></div>
  <div data-proto-state="empty" data-testid="list-empty"><p data-proto-text="empty"></p><button type="button" data-proto-go="list/ready" data-testid="list-add" data-proto-text="add"></button></div>
  <div data-proto-state="error" data-testid="list-error"><p role="alert" data-proto-text="error"></p><button type="button" data-proto-go="list/ready" data-testid="list-retry" data-proto-text="retry"></button></div>
</section></main>
<script type="application/json" data-proto-fixtures>
{ "product": "Saved items", "clear": "Clear the list", "empty": "No item on the list yet.", "add": "Save the two sample items", "error": "The list did not load. Your saved items are safe.", "retry": "Try again",
  "items": [{ "name": "Starter template" }, { "name": "Billing webhook" }] }
</script>
</body>
</html>
```

Save it as `design/items.html`, then run the loop's commands. For this design, `open-prototype shots` lists 14 views: three states at two web frames in two themes, then text at 200% and right to left on the fullest state. Its capture form takes all 14. The last form prints one JSON object, which every command that ends can do:

```sh
open-prototype screens design/items.html
open-prototype check design/items.html
open-prototype build design/items.html
open-prototype shots design/items.html --capture
open-prototype check design/items.html --json
```
