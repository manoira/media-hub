export const readingStatuses = ["Reading", "Want to Read", "Read"] as const;

export type ReadingStatus = (typeof readingStatuses)[number];

type Book = {
  isbn: string;
  title: string;
  author: string;
  genre: string;
  status: ReadingStatus;
};

export const exampleBooks: Book[] = [
  { isbn: "9780356500157", title: "The Fifth Season", author: "N. K. Jemisin", genre: "Fantasy", status: "Reading" },
  { isbn: "9780593135204", title: "Project Hail Mary", author: "Andy Weir", genre: "Science fiction", status: "Reading" },
  { isbn: "9781501161933", title: "The Seven Husbands of Evelyn Hugo", author: "Taylor Jenkins Reid", genre: "Fiction", status: "Reading" },
  { isbn: "9780593321201", title: "Tomorrow, and Tomorrow, and Tomorrow", author: "Gabrielle Zevin", genre: "Fiction", status: "Want to Read" },
  { isbn: "9781250295293", title: "The Invisible Life of Addie LaRue", author: "V. E. Schwab", genre: "Fantasy", status: "Want to Read" },
  { isbn: "9780441172719", title: "Dune", author: "Frank Herbert", genre: "Science fiction", status: "Want to Read" },
  { isbn: "9780062060624", title: "And Then There Were None", author: "Agatha Christie", genre: "Mystery", status: "Want to Read" },
  { isbn: "9780143130727", title: "The Haunting of Hill House", author: "Shirley Jackson", genre: "Horror", status: "Want to Read" },
  { isbn: "9781476753836", title: "The Nightingale", author: "Kristin Hannah", genre: "Historical fiction", status: "Want to Read" },
  { isbn: "9780307277671", title: "The Road", author: "Cormac McCarthy", genre: "Fiction", status: "Want to Read" },
  { isbn: "9780062315007", title: "The Alchemist", author: "Paulo Coelho", genre: "Fiction", status: "Read" },
  { isbn: "9780345339706", title: "The Fellowship of the Ring", author: "J. R. R. Tolkien", genre: "Fantasy", status: "Read" },
  { isbn: "9781400033416", title: "Beloved", author: "Toni Morrison", genre: "Fiction", status: "Read" },
  { isbn: "9780385534635", title: "The Night Circus", author: "Erin Morgenstern", genre: "Fantasy", status: "Read" },
  { isbn: "9780307588371", title: "Gone Girl", author: "Gillian Flynn", genre: "Mystery", status: "Read" },
  { isbn: "9780385547345", title: "Lessons in Chemistry", author: "Bonnie Garmus", genre: "Historical fiction", status: "Read" },
  { isbn: "9780804139021", title: "The Martian", author: "Andy Weir", genre: "Science fiction", status: "Read" },
  { isbn: "9780060850524", title: "Brave New World", author: "Aldous Huxley", genre: "Science fiction", status: "Read" },
  { isbn: "9780385486804", title: "Into the Wild", author: "Jon Krakauer", genre: "Nonfiction", status: "Read" },
  { isbn: "9780812993547", title: "Educated", author: "Tara Westover", genre: "Nonfiction", status: "Read" },
];
