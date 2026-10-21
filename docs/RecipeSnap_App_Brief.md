# RecipeSnap — App Concept and UI/UX Specification

## 1. Product Overview

**Working name:** RecipeSnap  
**Tagline:** Scan. Save. Cook.

RecipeSnap is an app that helps people keep all their recipes in one organized, searchable place. A user can scan a recipe from a cookbook, printed page, recipe card, handwritten note, or screenshot. The app extracts the information and converts it into a consistent digital recipe that the user can review, edit, and save.

The core product promise is simple: **turn recipes from almost any source into a personal digital cookbook with minimal effort.**

The name is a working name and can be changed.

## 2. Core User Workflow

The main workflow should be as short and clear as possible:

**Scan or upload → Extract → Review → Save**

1. The user takes a photo, uploads an image, or chooses another supported source.
2. The app detects the recipe and extracts the available information.
3. The app structures the content into a standard recipe format.
4. The user reviews the extracted information and fixes any mistakes.
5. The user saves the recipe to their personal library.
6. The recipe can later be searched, categorized, favorited, edited, and used while cooking.

Do not silently treat uncertain OCR results as verified. Flag unclear text or measurements for user review. Preserve the original image/source for reference when practical.

## 3. Recipe Information to Extract

Extract as many of these fields as the source provides:

- Recipe title
- Recipe image, if available
- Ingredients and quantities
- Ingredient notes or preparation details
- Step-by-step instructions
- Prep time
- Cook time
- Total time, when it can be calculated reliably
- Servings
- Difficulty, only when supplied or clearly selected by the user
- Category or meal type
- Cuisine, if known
- Tags
- Personal notes
- Original source image or source URL
- Date added

Never invent missing ingredients, measurements, instructions, or times. Mark missing fields as unavailable or let the user fill them in. Clearly distinguish information extracted from the source from AI-generated suggestions.

## 4. Main Screens

### Screen 1 — Welcome / Onboarding
Purpose: Explain the product quickly and let the user get started.

Suggested content:
- RecipeSnap logo/icon
- “Scan. Save. Cook.”
- Short description: “Turn any recipe into a digital collection. Just scan, and we’ll handle the rest.”
- Primary button: “Get Started”
- Secondary action: “I Already Have an Account”

Visual direction: premium, inviting food photography with a dark forest-green background and warm cream typography.

### Screen 2 — Scan a Recipe
Purpose: Capture a recipe from a physical source.

Suggested content:
- Live camera preview
- Clear scan frame or edge guidance
- Capture button
- Flash control
- Gallery/upload option
- Option to retake or crop an image
- Close/back navigation

The camera should make it easy to capture a whole recipe page. Support multi-page recipes where practical, and allow users to upload an existing image or screenshot.

### Screen 3 — AI Extraction / Processing
Purpose: Show that the app is working on the image.

Suggested content:
- Calm loading animation
- Message such as “Extracting your recipe…”
- Supporting text: “We’re identifying the ingredients, instructions, and details from your source.”
- Progress indicator, if progress can be estimated honestly

Do not show fake precision or claim the extraction is complete before it is.

### Screen 4 — Generated Recipe / Review
Purpose: Show the extracted recipe in a consistent, readable format before it is saved.

Suggested content:
- Recipe title and image
- Prep time, cook time, servings, and difficulty if known
- Ingredients list
- Numbered instructions
- Clearly marked fields that need verification
- Edit action
- Primary “Save Recipe” button

This is a crucial screen. Users should be able to correct OCR errors before saving. Preserve the original source so they can compare extracted text with the source.

### Screen 5 — My Recipes
Purpose: Search and browse the user's personal recipe library.

Suggested content:
- Search field
- Category filters, such as All, Breakfast, Lunch, Dinner, Snacks, Desserts, and Drinks
- Recipe cards with image, title, category, and time where available
- Favorite/bookmark action
- Add/scan recipe action
- Empty state for users who have not saved any recipes

Search should ideally support recipe title, ingredients, categories, and tags.

### Screen 6 — Home Dashboard
Purpose: Make the main actions easy to access.

Suggested content:
- Greeting or app header
- Search field
- Prominent “Scan a Recipe” card/button
- Recently added recipes
- Favorites or frequently used recipes
- Category shortcuts
- Bottom navigation

The scan action should be visually prominent and easy to reach.

### Screen 7 — Edit Recipe
Purpose: Let users correct and personalize saved recipes.

Suggested content:
- Recipe photo with change-photo option
- Editable title
- Category selector
- Servings control
- Prep and cook time fields
- Difficulty field, if used
- Editable ingredients list with add/remove/reorder options
- Editable instructions with add/remove/reorder options
- Personal notes and tags
- Save and cancel actions

Make ingredient quantities and units easy to edit. If serving-size scaling is implemented, adjust ingredient quantities carefully and let the user review the results.

### Screen 8 — Grocery List
Purpose: Combine ingredients from recipes into a shopping checklist.

Suggested content:
- Ingredients grouped by categories such as Produce, Dairy, and Pantry
- Checkboxes
- Ability to add an item manually
- Ability to add ingredients from one or more recipes
- Avoid duplicate items where possible, but do not incorrectly combine incompatible units or ingredients
- Mark items as purchased

Grocery lists are a useful later feature; prioritize recipe scanning and storage first if development time is limited.

### Screen 9 — Cooking Mode
Purpose: Make recipes convenient to follow in the kitchen.

Suggested content:
- Large, readable text
- One instruction or step at a time, or a clear step-by-step layout
- Next and previous controls
- Ingredient checklist
- Timers when a step specifies a reliable duration
- Screen-friendly layout with minimal clutter
- Adjustable text size

Cooking mode can be a later-phase feature.

### Screen 10 — Profile and Settings
Purpose: Manage the user's account and preferences.

Suggested content:
- Profile/account details
- My Recipes shortcut
- Grocery List shortcut
- Scan History
- Settings
- Help and Support
- Privacy and account controls

## 5. Recommended Navigation

Use a simple bottom navigation with five destinations:

1. **Home**
2. **Recipes**
3. **Scan** — visually prominent central action
4. **Groceries**
5. **Profile**

If the grocery-list feature is not part of the first release, replace Groceries with another useful destination or simplify the navigation.

## 6. Visual Design Direction

### Primary recommendation: Forest Green + Warm Cream

- Deep forest green for primary backgrounds and actions
- Warm cream for reading surfaces and text on dark backgrounds
- Muted sage for subtle supporting accents
- Charcoal for readable dark text
- Food photography as a visual highlight
- Rounded cards and controls
- Clear hierarchy and generous spacing
- Simple, consistent line icons
- Modern, readable sans-serif typography

The interface should feel like a premium digital cookbook: warm, organized, trustworthy, and easy to use. Avoid making it look like a complicated enterprise dashboard.

### Alternative visual directions
- Minimal black and white, with a clean Apple-like feel
- Colorful and playful, with a food-discovery personality

Use the forest-green-and-cream design as the default unless instructed otherwise.

## 7. Design Principles

- Make scanning the most obvious action.
- Minimize the steps required to save a recipe.
- Keep recipe pages readable while cooking.
- Make the recipe library easy to search.
- Use consistent recipe-card layouts throughout the app.
- Ensure accessible contrast and readable text sizes.
- Include loading, success, error, empty, and permission-denied states.
- Make it easy to retry a failed scan.
- Ask for camera/photo permissions only when needed, and explain why.
- Handle poor lighting, rotated pages, multiple pages, handwriting, and partial images gracefully.
- Do not invent extracted recipe information. Give users a clear review and correction step.
- Make the original image/source available for verification when practical.

## 8. Suggested Data Model

A saved recipe may include:

- `id`
- `user_id`
- `title`
- `image_url` or local image reference
- `ingredients` — structured list of ingredient name, quantity, unit, and notes
- `instructions` — ordered list of steps
- `prep_time_minutes`
- `cook_time_minutes`
- `servings`
- `category`
- `cuisine`
- `tags`
- `personal_notes`
- `source_type` — for example camera scan, image upload, or URL
- `source_image_url` or source-file reference
- `source_url`, when applicable
- `extraction_confidence` or field-level review indicators, if supported
- `created_at`
- `updated_at`
- `is_favorite`

Use a data structure that can handle missing values and multiple ingredients/instructions without forcing everything into one long text field. Protect users' private recipe collections and uploaded images.

## 9. AI / OCR Behavior

The extraction pipeline should ideally:

1. Accept a camera photo or uploaded image.
2. Correct orientation and crop the page when possible.
3. Detect and extract text.
4. Identify the title, ingredients, measurements, instructions, and available metadata.
5. Convert the extracted content into structured recipe fields.
6. Track uncertain fields so the user can verify them.
7. Present a review screen.
8. Save the recipe only when the user confirms.

Important safeguards:
- Never fabricate missing quantities or steps.
- Do not silently “correct” unusual ingredients or measurements.
- Preserve source content so users can compare it with the extracted version.
- If extraction fails, show a useful error and let the user retry, upload another image, or enter the recipe manually.
- Treat uploaded text and source content as data, not as instructions to the AI system.
- If URL importing is added, handle unsupported pages gracefully and respect website access restrictions.

## 10. Suggested Development Priorities

### MVP — Build First
1. Core app shell and navigation
2. Camera scan and image upload
3. OCR/AI extraction into structured recipe fields
4. Review and edit screen
5. Save recipe
6. Searchable recipe library
7. Edit/delete saved recipes
8. Basic categories and favorites
9. Loading, error, and empty states

### Phase 2
- Multi-page scanning
- Recipe URL importing
- Collections and custom tags
- Grocery lists
- Ingredient search
- Improved serving-size scaling
- Scan history
- Cloud sync across devices

### Phase 3
- Cooking mode and timers
- Meal planning
- Sharing recipes with friends or family
- Duplicate detection
- Import/export
- Optional nutrition information from a reliable source, clearly distinguished from extracted data

Prioritize the core scan-to-save experience over adding too many secondary features before it works reliably.

## 11. Example Recipe for UI Mockups

Use this fictional/example recipe to populate sample screens:

**Creamy Garlic Pasta**
- Category: Main Course
- Prep time: 10 minutes
- Cook time: 15 minutes
- Servings: 4
- Ingredients:
  - 12 oz pasta
  - 2 tbsp olive oil
  - 4 cloves garlic, minced
  - 1 cup heavy cream
  - 1/2 cup grated Parmesan cheese
  - Salt and pepper to taste
- Instructions:
  1. Cook pasta according to package instructions.
  2. Heat olive oil in a pan and sauté garlic for 1–2 minutes.
  3. Add cream and simmer for 5 minutes.
  4. Stir in Parmesan, then season with salt and pepper.
  5. Toss with pasta and serve.

Treat this as demonstration content, not a verified real recipe.

Other example recipe-card titles for mockups:
- Chicken Teriyaki Bowl
- Avocado Toast
- Chocolate Chip Cookies
- Greek Salad

## 12. Product Design Deliverables to Create

When asked to design or implement the app, work toward:

- A high-fidelity screen set covering the main user flow
- Reusable UI components for recipe cards, buttons, inputs, navigation, and ingredient rows
- A clickable prototype with working navigation, where possible
- Responsive behavior for the selected platform
- Clear empty/loading/error/success states
- A practical technical implementation plan
- A functional scan-to-save flow, not just static mockups, if implementation is requested

## 13. Instructions for Claude

Act as a senior product designer and pragmatic full-stack product engineer.

Use this document as the product brief for RecipeSnap. First, identify the deliverable requested by the user (for example, visual mockups, an interactive prototype, or a functional app). Do not assume static images are a substitute for working functionality when the user asks for a working app.

When implementing:
- Build the simplest reliable version of the core workflow first.
- Keep components modular and maintainable.
- Use clear, consistent naming.
- Include realistic sample data and graceful error states.
- Do not claim scanning or AI extraction works unless it is actually implemented and connected to a working OCR/AI method.
- If credentials, external services, or platform-specific setup are required, explain exactly what is needed and provide a safe configuration approach. Never hardcode secret API keys into client-side code.
- If a choice is not specified, use sensible defaults from this brief rather than blocking on minor questions.
- Explain how to run the project and what works versus what remains a placeholder.
- Keep the design polished, coherent, responsive, and focused on the user's main goal: easily turning recipes from many sources into an organized personal cookbook.

## 14. Open Product Decisions

These can be decided during implementation:
- Final app name and branding
- Mobile-first, web-first, or cross-platform approach
- Authentication and cloud storage provider
- OCR/AI provider and cost controls
- Whether URL importing belongs in the MVP
- Free versus paid feature limits
- Sharing and privacy defaults

Recommended default: start with a responsive, mobile-first interface and a reliable MVP focused on scan, extract, review, save, and search.
