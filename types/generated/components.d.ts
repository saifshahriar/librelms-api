import type { Schema, Struct } from '@strapi/strapi';

export interface BlocksLessonContent extends Struct.ComponentSchema {
  collectionName: 'components_blocks_lesson_contents';
  info: {
    description: 'Text or video payload of a lesson';
    displayName: 'Lesson Content';
    icon: 'alignLeft';
  };
  attributes: {
    body: Schema.Attribute.RichText;
    kind: Schema.Attribute.Enumeration<['text', 'video']> &
      Schema.Attribute.Required &
      Schema.Attribute.DefaultTo<'text'>;
    videoFile: Schema.Attribute.Media<'videos'>;
    videoUrl: Schema.Attribute.String;
  };
}

export interface BlocksQuizOption extends Struct.ComponentSchema {
  collectionName: 'components_blocks_quiz_options';
  info: {
    description: 'One MCQ option';
    displayName: 'Quiz Option';
    icon: 'checkCircle';
  };
  attributes: {
    isCorrect: Schema.Attribute.Boolean &
      Schema.Attribute.Required &
      Schema.Attribute.DefaultTo<false>;
    text: Schema.Attribute.String & Schema.Attribute.Required;
  };
}

export interface BlocksQuizQuestion extends Struct.ComponentSchema {
  collectionName: 'components_blocks_quiz_questions';
  info: {
    description: 'MCQ question with options';
    displayName: 'Quiz Question';
    icon: 'question';
  };
  attributes: {
    options: Schema.Attribute.Component<'blocks.quiz-option', true> &
      Schema.Attribute.SetMinMax<
        {
          min: 2;
        },
        number
      >;
    text: Schema.Attribute.Text & Schema.Attribute.Required;
  };
}

declare module '@strapi/strapi' {
  export namespace Public {
    export interface ComponentSchemas {
      'blocks.lesson-content': BlocksLessonContent;
      'blocks.quiz-option': BlocksQuizOption;
      'blocks.quiz-question': BlocksQuizQuestion;
    }
  }
}
