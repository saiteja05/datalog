# MongoDB CRUD Operations

A comprehensive guide to MongoDB's Create, Read, Update, and Delete operations.

## 🎯 Purpose

This guide provides:
- Complete coverage of MongoDB CRUD operations
- Practical code examples with syntax highlighting
- Best practices for each operation type
- Common patterns and anti-patterns

## 📋 Operations Covered

### Create Operations
- `insertOne()` - Insert a single document
- `insertMany()` - Bulk insert multiple documents
- `bulkWrite()` - Mixed bulk operations

### Read Operations
- `find()` - Query documents with filters
- `findOne()` - Retrieve a single document
- Query operators - Comparison, logical, element, array
- Projection - Selecting specific fields
- Sorting and pagination

### Update Operations
- `updateOne()` - Update a single document
- `updateMany()` - Update multiple documents
- `replaceOne()` - Replace entire document
- Update operators - `$set`, `$inc`, `$push`, `$pull`, etc.
- Upsert operations

### Delete Operations
- `deleteOne()` - Remove a single document
- `deleteMany()` - Remove multiple documents
- Soft deletes pattern

## 🚀 Quick Start

1. Open `crud.html` in a web browser
2. Navigate through sections using the headers
3. Copy code examples using the copy button
4. Modify examples for your use case

## 🎨 Features

- **Syntax Highlighting** - Color-coded JavaScript/MongoDB code
- **Copy to Clipboard** - One-click code copying
- **Organized Sections** - Easy navigation
- **Practical Examples** - Real-world scenarios

## 💡 Best Practices

- Always use specific filters in updates/deletes
- Use projection to limit returned fields
- Index fields used in queries
- Use bulk operations for multiple writes
- Handle errors appropriately

## 🔗 Related Resources

- [CRUD Operations Documentation](https://www.mongodb.com/docs/manual/crud/)
- [Query Operators](https://www.mongodb.com/docs/manual/reference/operator/query/)
- [Update Operators](https://www.mongodb.com/docs/manual/reference/operator/update/)
